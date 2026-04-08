import { useState, useEffect } from 'react';
import { Gift, Plus, Trash2, Play, Trophy, Eye, EyeOff, Users, StopCircle, Shuffle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Giveaway {
  id: string;
  name: string;
  command: string;
  status: 'active' | 'drawing' | 'completed';
  winner_username: string | null;
  winner_profile_image_url: string | null;
  total_participants: number;
  is_visible: boolean;
  duration_minutes: number;
  end_time: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Participant {
  id: string;
  username: string;
  user_id: string;
  profile_image_url?: string;
  created_at: string;
}

export function GiveawayManager() {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [newGiveaway, setNewGiveaway] = useState({ name: '', command: '!sorteio', duration_minutes: 30 });

  useEffect(() => {
    loadGiveaways();

    const giveawayChannel = supabase
      .channel('giveaways_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaways' }, () => {
        loadGiveaways();
        if (selectedGiveaway) {
          loadGiveawayDetails(selectedGiveaway.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaway_participants' }, () => {
        if (selectedGiveaway) {
          loadParticipants(selectedGiveaway.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(giveawayChannel);
    };
  }, [selectedGiveaway]);

  const loadGiveaways = async () => {
    const { data, error } = await supabase
      .from('giveaways')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading giveaways:', error);
      return;
    }
    setGiveaways(data || []);
  };

  const loadGiveawayDetails = async (giveawayId: string) => {
    const { data, error } = await supabase
      .from('giveaways')
      .select('*')
      .eq('id', giveawayId)
      .single();

    if (error) {
      console.error('Error loading giveaway:', error);
      return;
    }
    setSelectedGiveaway(data);
  };

  const loadParticipants = async (giveawayId: string) => {
    const { data, error } = await supabase
      .from('giveaway_participants')
      .select('*')
      .eq('giveaway_id', giveawayId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading participants:', error);
      return;
    }
    setParticipants(data || []);
  };

  const createGiveaway = async () => {
    if (!newGiveaway.name.trim() || !newGiveaway.command.trim()) {
      alert('Preencha todos os campos');
      return;
    }

    if (newGiveaway.duration_minutes <= 0) {
      alert('Duração deve ser maior que 0 minutos');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('giveaways')
      .insert({
        name: newGiveaway.name,
        command: newGiveaway.command,
        duration_minutes: newGiveaway.duration_minutes,
        status: 'active',
        is_visible: false
      });

    if (error) {
      console.error('Error creating giveaway:', error);
      alert('Erro ao criar sorteio');
    } else {
      setNewGiveaway({ name: '', command: '!sorteio', duration_minutes: 30 });
      await loadGiveaways();
    }
    setLoading(false);
  };

  const deleteGiveaway = async (id: string) => {
    if (!confirm('Tem certeza que deseja eliminar este sorteio?')) return;

    const { error } = await supabase
      .from('giveaways')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting giveaway:', error);
      alert('Erro ao eliminar sorteio');
    } else {
      if (selectedGiveaway?.id === id) {
        setSelectedGiveaway(null);
        setParticipants([]);
      }
      await loadGiveaways();
    }
  };

  const toggleVisibility = async (giveaway: Giveaway) => {
    await supabase
      .from('giveaways')
      .update({ is_visible: false })
      .neq('id', giveaway.id);

    await supabase
      .from('giveaways')
      .update({ is_visible: !giveaway.is_visible })
      .eq('id', giveaway.id);
  };

  const endGiveaway = async () => {
    if (!selectedGiveaway) return;

    await supabase
      .from('giveaways')
      .update({
        end_time: new Date().toISOString()
      })
      .eq('id', selectedGiveaway.id);

    alert('Sorteio terminado! Agora podes sortear o vencedor.');
  };

  const drawWinner = async () => {
    if (!selectedGiveaway || participants.length === 0) {
      alert('Não há participantes para sortear');
      return;
    }

    // Set status to drawing to trigger overlay animation
    await supabase
      .from('giveaways')
      .update({ status: 'drawing' })
      .eq('id', selectedGiveaway.id);

    // Wait for overlay to finish rolling (5 seconds)
    setTimeout(async () => {
      const finalIndex = Math.floor(Math.random() * participants.length);
      const winner = participants[finalIndex];

      // Update to completed with winner
      await supabase
        .from('giveaways')
        .update({
          status: 'completed',
          winner_username: winner.username,
          winner_profile_image_url: winner.profile_image_url,
          completed_at: new Date().toISOString()
        })
        .eq('id', selectedGiveaway.id);
    }, 5000);
  };

  const rerollWinner = async () => {
    if (!selectedGiveaway || participants.length === 0) {
      alert('Não há participantes para sortear');
      return;
    }

    if (!confirm('Deseja sortear um novo vencedor?')) return;

    // Set status to drawing to trigger overlay animation
    await supabase
      .from('giveaways')
      .update({ status: 'drawing' })
      .eq('id', selectedGiveaway.id);

    // Wait for overlay to finish rolling (5 seconds)
    setTimeout(async () => {
      const finalIndex = Math.floor(Math.random() * participants.length);
      const winner = participants[finalIndex];

      // Update to completed with new winner
      await supabase
        .from('giveaways')
        .update({
          status: 'completed',
          winner_username: winner.username,
          winner_profile_image_url: winner.profile_image_url,
          completed_at: new Date().toISOString()
        })
        .eq('id', selectedGiveaway.id);
    }, 5000);
  };

  const openGiveaway = (giveaway: Giveaway) => {
    setSelectedGiveaway(giveaway);
    loadParticipants(giveaway.id);
  };

  if (selectedGiveaway) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedGiveaway(null);
            setParticipants([]);
          }}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          ← Voltar
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{selectedGiveaway.name}</h2>
              <p className="text-slate-400">Comando: <span className="text-emerald-400 font-semibold">{selectedGiveaway.command}</span></p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleVisibility(selectedGiveaway)}
                className={`p-3 rounded-lg transition-all ${
                  selectedGiveaway.is_visible
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {selectedGiveaway.is_visible ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
              {selectedGiveaway.status === 'active' && (
                <>
                  <button
                    onClick={endGiveaway}
                    className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-2"
                  >
                    <StopCircle size={20} />
                    TERMINAR TIMER
                  </button>
                  <button
                    onClick={drawWinner}
                    disabled={participants.length === 0}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-bold hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Shuffle size={20} />
                    SORTEAR VENCEDOR
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedGiveaway.winner_username && (
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/20 to-amber-600/20 border-2 border-amber-500 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="text-amber-400" size={24} />
                  <div>
                    <p className="text-sm text-slate-300">VENCEDOR</p>
                    <p className="text-xl font-bold text-white">{selectedGiveaway.winner_username}</p>
                  </div>
                </div>
                <button
                  onClick={rerollWinner}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-all flex items-center gap-2"
                >
                  <Shuffle size={18} />
                  REROLL
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-emerald-400" size={20} />
              <h3 className="text-lg font-semibold text-white">Participantes</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-400">{selectedGiveaway.total_participants}</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Lista de Participantes</h3>
            {participants.length === 0 ? (
              <p className="text-slate-400 text-center py-8">Nenhum participante ainda</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                {participants.map(participant => (
                  <div
                    key={participant.id}
                    className="bg-slate-700/50 border border-slate-600 rounded-lg p-3"
                  >
                    <p className="text-white font-semibold text-sm truncate">{participant.username}</p>
                    <p className="text-slate-400 text-xs">{new Date(participant.created_at).toLocaleTimeString('pt-PT')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
            <Gift className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white uppercase">Sorteios</h2>
            <p className="text-slate-400 text-sm">Criar e gerir sorteios da comunidade</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Criar Novo Sorteio</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Nome do Sorteio"
            value={newGiveaway.name}
            onChange={(e) => setNewGiveaway({ ...newGiveaway, name: e.target.value })}
            className="px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Comando (ex: !sorteio)"
            value={newGiveaway.command}
            onChange={(e) => setNewGiveaway({ ...newGiveaway, command: e.target.value })}
            className="px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <input
            type="number"
            placeholder="Duração (minutos)"
            value={newGiveaway.duration_minutes}
            onChange={(e) => setNewGiveaway({ ...newGiveaway, duration_minutes: parseInt(e.target.value) || 30 })}
            min="1"
            className="px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={createGiveaway}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            CRIAR
          </button>
        </div>
      </div>

      {giveaways.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 border border-slate-700 text-center">
          <Gift className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Nenhum sorteio criado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {giveaways.map(giveaway => (
            <div
              key={giveaway.id}
              className="bg-slate-700/50 border-2 border-slate-600 rounded-lg p-4 hover:border-amber-400 transition-all cursor-pointer"
              onClick={() => openGiveaway(giveaway)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">{giveaway.name}</h3>
                  <p className="text-sm text-slate-400">{giveaway.command}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGiveaway(giveaway.id);
                  }}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Participantes:</span>
                  <span className="text-white font-semibold">{giveaway.total_participants}</span>
                </div>

                {giveaway.winner_username && (
                  <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded">
                    <p className="text-xs text-amber-400">VENCEDOR</p>
                    <p className="text-sm font-bold text-white">{giveaway.winner_username}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-600">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    giveaway.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : giveaway.status === 'completed'
                      ? 'bg-slate-600 text-slate-300'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {giveaway.status.toUpperCase()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(giveaway);
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all ${
                      giveaway.is_visible
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                    }`}
                  >
                    {giveaway.is_visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    {giveaway.is_visible ? 'VISÍVEL' : 'OCULTO'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
