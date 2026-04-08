import { useState, useEffect } from 'react';
import { Coffee, Plus, X, TrendingUp, TrendingDown, CreditCard as Edit2, Search, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChillSession {
  id: string;
  slot_name: string;
  started_at: string;
  ended_at: string | null;
  total_bonuses: number;
  total_bet: number;
  total_won: number;
  show_on_main_overlay?: boolean;
}

interface ChillBonus {
  id: string;
  session_id: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  created_at: string;
}

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url?: string;
}

export function ChillSessionManager() {
  const [activeSession, setActiveSession] = useState<ChillSession | null>(null);
  const [bonuses, setBonuses] = useState<ChillBonus[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [showSlotDropdown, setShowSlotDropdown] = useState(false);
  const [slotSearchQuery, setSlotSearchQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [newBonus, setNewBonus] = useState({
    bet: '',
    win: ''
  });

  useEffect(() => {
    loadActiveSession();
  }, []);

  useEffect(() => {
    if (activeSession) {
      loadBonuses();

      const channel = supabase
        .channel('chill_session_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_sessions' }, () => {
          loadActiveSession();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_bonuses' }, () => {
          loadBonuses();
          loadActiveSession();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeSession?.id]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchSlots(slotSearchQuery);
    }, 300);

    return () => clearTimeout(debounce);
  }, [slotSearchQuery]);

  useEffect(() => {
    const handleClickOutside = () => {
      setShowSlotDropdown(false);
    };

    if (showSlotDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showSlotDropdown]);

  const searchSlots = async (query: string) => {
    if (!query || query.length < 2) {
      setSlots([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('slots')
        .select('id, name, provider, image_url')
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })
        .limit(50);

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error('Error searching slots:', error);
    }
  };

  const loadActiveSession = async () => {
    try {
      const { data, error } = await supabase
        .from('chill_sessions')
        .select('*')
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveSession(data);

      if (data) {
        const { data: slotData } = await supabase
          .from('slots')
          .select('id, name, provider, image_url')
          .eq('name', data.slot_name)
          .maybeSingle();

        if (slotData) {
          setSelectedSlot(slotData);
        }
      }
    } catch (error) {
      console.error('Error loading active session:', error);
    }
  };

  const loadBonuses = async () => {
    if (!activeSession) return;

    try {
      const { data, error } = await supabase
        .from('chill_bonuses')
        .select('*')
        .eq('session_id', activeSession.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBonuses(data || []);
    } catch (error) {
      console.error('Error loading bonuses:', error);
    }
  };

  const startSession = async () => {
    if (!selectedSlot) {
      alert('Escolhe uma slot primeiro');
      return;
    }

    try {
      await supabase.from('bonus_hunts').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bonus_openings').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');

      const { data, error } = await supabase
        .from('chill_sessions')
        .insert({
          slot_name: selectedSlot.name,
          show_on_main_overlay: true
        })
        .select()
        .single();

      if (error) throw error;
      setActiveSession(data);

      await supabase
        .from('overlays')
        .update({ is_active: false })
        .in('type', ['bonus_hunt', 'bonus_opening']);

      const { data: chillOverlay } = await supabase
        .from('overlays')
        .select('id')
        .eq('type', 'chill')
        .maybeSingle();

      if (chillOverlay) {
        await supabase
          .from('overlays')
          .update({ is_active: true })
          .eq('id', chillOverlay.id);
      }

      console.log('[ChillSessionManager] Session started and overlay activated');
    } catch (error) {
      console.error('Error starting session:', error);
      alert('Erro ao iniciar sessão');
    }
  };

  const endSession = async () => {
    if (!activeSession) return;

    try {
      const { error } = await supabase
        .from('chill_sessions')
        .update({
          ended_at: new Date().toISOString()
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setTimeout(async () => {
        await supabase
          .from('chill_sessions')
          .update({ show_on_main_overlay: false })
          .eq('id', activeSession.id);
      }, 1200);

      setActiveSession(null);
      setBonuses([]);
      setSelectedSlot(null);
    } catch (error) {
      console.error('Error ending session:', error);
      alert('Erro ao terminar sessão');
    }
  };

  const addBonus = async () => {
    if (!activeSession || !newBonus.bet || !newBonus.win) {
      alert('Preenche todos os campos');
      return;
    }

    try {
      const betAmount = parseFloat(newBonus.bet);
      const winAmount = parseFloat(newBonus.win);
      const multiplier = winAmount / betAmount;

      const { error } = await supabase
        .from('chill_bonuses')
        .insert({
          session_id: activeSession.id,
          bet_amount: betAmount,
          win_amount: winAmount,
          multiplier: multiplier
        });

      if (error) throw error;

      setNewBonus({ bet: '', win: '' });
      await loadBonuses();
    } catch (error) {
      console.error('Error adding bonus:', error);
      alert('Erro ao adicionar bonus');
    }
  };

  const deleteBonus = async (bonusId: string) => {
    if (!confirm('Apagar este bonus?')) return;

    try {
      const { error } = await supabase
        .from('chill_bonuses')
        .delete()
        .eq('id', bonusId);

      if (error) throw error;
      await loadBonuses();
    } catch (error) {
      console.error('Error deleting bonus:', error);
      alert('Erro ao apagar bonus');
    }
  };

  const changeSlot = async (newSlot: Slot) => {
    if (!activeSession) return;

    try {
      const { error } = await supabase
        .from('chill_sessions')
        .update({
          slot_name: newSlot.name
        })
        .eq('id', activeSession.id);

      if (error) throw error;

      setSelectedSlot(newSlot);
      setSlotSearchQuery('');
      setSlots([]);
      setShowSlotDropdown(false);
      await loadActiveSession();
    } catch (error) {
      console.error('Error changing slot:', error);
      alert('Erro ao alterar slot');
    }
  };

  const activateOverlay = async () => {
    if (!activeSession) return;

    try {
      await Promise.all([
        supabase
          .from('bonus_hunts')
          .update({ show_on_main_overlay: false, updated_at: new Date().toISOString() })
          .neq('id', '00000000-0000-0000-0000-000000000000'),

        supabase
          .from('bonus_openings')
          .update({ show_on_main_overlay: false, updated_at: new Date().toISOString() })
          .neq('id', '00000000-0000-0000-0000-000000000000'),

        supabase
          .from('chill_sessions')
          .update({ show_on_main_overlay: false, updated_at: new Date().toISOString() })
          .neq('id', activeSession.id),

        supabase
          .from('overlays')
          .update({ is_active: false })
          .in('type', ['bonus_hunt', 'bonus_opening', 'main_stream'])
      ]);

      await supabase
        .from('chill_sessions')
        .update({ show_on_main_overlay: true, updated_at: new Date().toISOString() })
        .eq('id', activeSession.id);

      const { data: chillOverlay } = await supabase
        .from('overlays')
        .select('id')
        .eq('type', 'chill')
        .maybeSingle();

      if (chillOverlay) {
        await supabase
          .from('overlays')
          .update({ is_active: true })
          .eq('id', chillOverlay.id);
      }

      console.log('[ChillSessionManager] Chill session overlay activated');
      await loadActiveSession();
    } catch (error) {
      console.error('Error activating overlay:', error);
      alert('Erro ao ativar overlay');
    }
  };

  const deactivateOverlay = async () => {
    if (!activeSession) return;

    try {
      await Promise.all([
        supabase
          .from('chill_sessions')
          .update({ show_on_main_overlay: false, updated_at: new Date().toISOString() })
          .eq('id', activeSession.id),

        supabase
          .from('overlays')
          .update({ is_active: false })
          .in('type', ['chill', 'main_stream'])
      ]);

      console.log('[ChillSessionManager] Chill session overlay deactivated - checking for fallback');

      const { data: anyActiveChill } = await supabase
        .from('chill_sessions')
        .select('id')
        .is('ended_at', null)
        .neq('id', activeSession.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyActiveChill) {
        console.log('[ChillSessionManager] Found another active chill session, activating it');
        await supabase
          .from('chill_sessions')
          .update({ show_on_main_overlay: true, updated_at: new Date().toISOString() })
          .eq('id', anyActiveChill.id);

        const { data: chillOverlay } = await supabase
          .from('overlays')
          .select('id')
          .eq('type', 'chill')
          .maybeSingle();

        if (chillOverlay) {
          await supabase
            .from('overlays')
            .update({ is_active: true })
            .eq('id', chillOverlay.id);
        }
      }

      await loadActiveSession();
    } catch (error) {
      console.error('Error deactivating overlay:', error);
      alert('Erro ao desativar overlay');
    }
  };

  const profitLoss = activeSession ? activeSession.total_won - activeSession.total_bet : 0;
  const averageMultiplier = activeSession && activeSession.total_bonuses > 0
    ? activeSession.total_won / activeSession.total_bet
    : 0;

  if (!activeSession) {
    return (
      <div className="rounded-xl p-8" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
        <h3 className="text-xl font-bold uppercase mb-6" style={{ color: '#b89968' }}>Iniciar Sessão Chill</h3>

        <div className="relative mb-6" onClick={(e) => e.stopPropagation()}>
          <label className="block text-sm font-bold uppercase mb-3" style={{ color: '#8a8a8a' }}>Escolhe a Slot</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#6a6a6a' }} />
            <input
              type="text"
              value={slotSearchQuery}
              onChange={(e) => {
                setSlotSearchQuery(e.target.value);
                setShowSlotDropdown(true);
              }}
              onFocus={() => setShowSlotDropdown(true)}
              placeholder="Procura pela slot..."
              className="w-full pl-12 pr-4 py-4 rounded-lg focus:ring-2 transition-all uppercase text-sm"
              style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
            />
          </div>

          {showSlotDropdown && slots.length > 0 && (
            <div className="absolute z-10 w-full mt-2 rounded-lg shadow-xl max-h-80 overflow-y-auto" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
              {slots.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setSlotSearchQuery('');
                    setShowSlotDropdown(false);
                    setSlots([]);
                  }}
                  className="w-full text-left px-4 py-3 transition-all border-b"
                  style={{ borderColor: '#2d2d2d' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#2d2d2d'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-center gap-3">
                    {slot.image_url && (
                      <img src={slot.image_url}
                      onError={(e) => {
                        e.currentTarget.src = '/image.png';
                      }} alt={slot.name} className="w-16 h-16 rounded object-cover" />
                    )}
                    <div>
                      <div className="font-bold uppercase text-sm" style={{ color: '#d4d4d4' }}>{slot.name}</div>
                      <div className="text-xs uppercase" style={{ color: '#8a8a8a' }}>{slot.provider}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedSlot && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-4" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
            {selectedSlot.image_url && (
              <img src={selectedSlot.image_url}
                      onError={(e) => {
                        e.currentTarget.src = '/image.png';
                      }} alt={selectedSlot.name} className="w-20 h-20 rounded-lg object-cover" />
            )}
            <div>
              <div className="font-bold uppercase" style={{ color: '#b89968' }}>{selectedSlot.name}</div>
              <div className="text-sm uppercase" style={{ color: '#8a8a8a' }}>{selectedSlot.provider}</div>
            </div>
          </div>
        )}

        <button
          onClick={startSession}
          disabled={!selectedSlot}
          className="w-full px-6 py-4 rounded-xl font-bold uppercase text-sm flex items-center justify-center gap-2 transition-all"
          style={{
            background: selectedSlot ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : '#2d2d2d',
            border: '1px solid #3d3d3d',
            color: selectedSlot ? '#ffffff' : '#6a6a6a',
            cursor: selectedSlot ? 'pointer' : 'not-allowed'
          }}
        >
          <Coffee className="w-5 h-5" />
          Começar Sessão Chill
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {selectedSlot?.image_url && (
              <img src={selectedSlot.image_url}
                      onError={(e) => {
                        e.currentTarget.src = '/image.png';
                      }} alt={selectedSlot.name} className="w-24 h-24 rounded-xl object-cover" style={{ border: '2px solid #3d3d3d' }} />
            )}
            <div>
              <h3 className="text-2xl font-bold uppercase" style={{ color: '#b89968' }}>{activeSession.slot_name}</h3>
              <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Sessão Ativa</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={activeSession.show_on_main_overlay ? deactivateOverlay : activateOverlay}
              className="flex items-center gap-2 px-4 py-3 rounded-lg font-bold uppercase text-sm transition-all"
              style={{
                background: activeSession.show_on_main_overlay ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#2d2d2d',
                color: '#ffffff',
                border: '1px solid #3d3d3d'
              }}
            >
              <Monitor className="w-5 h-5" />
              {activeSession.show_on_main_overlay ? 'Desativar' : 'Ativar'}
            </button>
            <button
              onClick={endSession}
              className="px-6 py-3 rounded-lg font-bold uppercase text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#ffffff', border: '1px solid #3d3d3d' }}
            >
              Terminar
            </button>
          </div>
        </div>

        <div className="relative mb-6" onClick={(e) => e.stopPropagation()}>
          <label className="block text-sm font-bold uppercase mb-3" style={{ color: '#8a8a8a' }}>Mudar Slot</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#6a6a6a' }} />
            <input
              type="text"
              value={slotSearchQuery}
              onChange={(e) => {
                setSlotSearchQuery(e.target.value);
                setShowSlotDropdown(true);
              }}
              onFocus={() => setShowSlotDropdown(true)}
              placeholder="Procura para mudar a slot..."
              className="w-full pl-12 pr-4 py-3 rounded-lg focus:ring-2 transition-all uppercase text-sm"
              style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
            />
          </div>

          {showSlotDropdown && slots.length > 0 && (
            <div className="absolute z-10 w-full mt-2 rounded-lg shadow-xl max-h-60 overflow-y-auto" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
              {slots.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => changeSlot(slot)}
                  className="w-full text-left px-4 py-3 transition-all border-b"
                  style={{ borderColor: '#2d2d2d' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#2d2d2d'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-center gap-3">
                    {slot.image_url && (
                      <img src={slot.image_url}
                      onError={(e) => {
                        e.currentTarget.src = '/image.png';
                      }} alt={slot.name} className="w-16 h-16 rounded object-cover" />
                    )}
                    <div>
                      <div className="font-bold uppercase text-sm" style={{ color: '#d4d4d4' }}>{slot.name}</div>
                      <div className="text-xs uppercase" style={{ color: '#8a8a8a' }}>{slot.provider}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg p-4" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
            <p className="text-xs uppercase mb-2" style={{ color: '#8a8a8a' }}>Bonuses</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>{activeSession.total_bonuses}</p>
          </div>
          <div className="rounded-lg p-4" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
            <p className="text-xs uppercase mb-2" style={{ color: '#8a8a8a' }}>Total Bet</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>€{activeSession.total_bet.toFixed(2)}</p>
          </div>
          <div className="rounded-lg p-4" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
            <p className="text-xs uppercase mb-2" style={{ color: '#8a8a8a' }}>Total Ganho</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>€{activeSession.total_won.toFixed(2)}</p>
          </div>
          <div className="rounded-lg p-4" style={{
            background: profitLoss >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${profitLoss >= 0 ? '#22c55e' : '#ef4444'}`
          }}>
            <div className="flex items-center gap-1 mb-2">
              {profitLoss >= 0 ? <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} /> : <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
              <p className="text-xs uppercase" style={{ color: profitLoss >= 0 ? '#22c55e' : '#ef4444' }}>Lucro</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: profitLoss >= 0 ? '#22c55e' : '#ef4444' }}>€{profitLoss.toFixed(2)}</p>
          </div>
        </div>

        {activeSession.total_bonuses > 0 && (
          <div className="mt-4 rounded-lg p-4" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
            <p className="text-xs uppercase mb-2" style={{ color: '#8a8a8a' }}>Multiplicador Médio</p>
            <p className="text-2xl font-bold" style={{ color: '#b89968' }}>{averageMultiplier.toFixed(2)}x</p>
          </div>
        )}
      </div>

      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
        <div className="bg-slate-800/60 rounded-lg p-4" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-3">
            {selectedSlot?.image_url && (
              <img
                src={selectedSlot.image_url}
                      onError={(e) => {
                        e.currentTarget.src = '/image.png';
                      }}
                alt={selectedSlot.name}
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}
              />
            )}

            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={activeSession.slot_name}
                disabled
                className="w-full px-3 py-2 rounded text-sm font-medium"
                style={{
                  background: 'rgba(71, 85, 105, 0.5)',
                  border: '1px solid rgba(100, 116, 139, 0.3)',
                  color: '#e2e8f0'
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={newBonus.bet}
                  onChange={(e) => setNewBonus({ ...newBonus, bet: e.target.value })}
                  placeholder="VALUE"
                  className="px-3 py-2 rounded text-sm text-center font-medium placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{
                    background: 'rgba(71, 85, 105, 0.5)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    color: '#e2e8f0'
                  }}
                />

                <input
                  type="number"
                  step="0.01"
                  value={newBonus.win}
                  onChange={(e) => setNewBonus({ ...newBonus, win: e.target.value })}
                  placeholder="EARNING"
                  className="px-3 py-2 rounded text-sm text-center font-medium placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{
                    background: 'rgba(71, 85, 105, 0.5)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    color: '#e2e8f0'
                  }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={addBonus}
            disabled={!newBonus.bet || !newBonus.win}
            className="w-full mt-3 px-6 py-2.5 rounded-lg font-bold uppercase text-sm transition-all"
            style={{
              background: newBonus.bet && newBonus.win ? '#22c55e' : 'rgba(71, 85, 105, 0.5)',
              color: '#ffffff',
              border: '1px solid rgba(100, 116, 139, 0.3)',
              cursor: newBonus.bet && newBonus.win ? 'pointer' : 'not-allowed',
              opacity: newBonus.bet && newBonus.win ? 1 : 0.6
            }}
          >
            SAVE
          </button>
        </div>

        {bonuses.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase mb-3" style={{ color: '#8a8a8a' }}>Histórico de Bonuses</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {bonuses.map((bonus, index) => (
                <div
                  key={bonus.id}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#8b7460', color: '#ffffff' }}>
                      {bonuses.length - index}
                    </span>
                    <div>
                      <p className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>
                        Bet: €{bonus.bet_amount.toFixed(2)} | Ganho: €{bonus.win_amount.toFixed(2)}
                      </p>
                      <p className="text-xs uppercase" style={{ color: '#8a8a8a' }}>
                        Multiplicador: {bonus.multiplier.toFixed(2)}x
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteBonus(bonus.id)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
