import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Play, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UnifiedBonusHuntController } from './UnifiedBonusHuntController';

interface BonusHunt {
  id: string;
  name: string;
  hunt_number: number;
  streamer_name: string | null;
  status: 'active' | 'opening' | 'completed';
  total_invested: number;
  current_break_even: number;
  initial_break_even: number;
  bonus_count: number;
  created_at: string;
  show_on_main_overlay?: boolean;
}

type WorkspaceView = 'list' | 'detail';

export function BonusHuntWorkspace() {
  const [hunts, setHunts] = useState<BonusHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<WorkspaceView>('list');
  const [selectedHuntId, setSelectedHuntId] = useState<string | null>(null);

  useEffect(() => {
    loadHunts();

    const channel = supabase
      .channel('bonus_hunt_workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunts' }, () => {
        loadHunts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunt_items' }, () => {
        loadHunts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadHunts = async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHunts(data || []);
    } catch (error) {
      console.error('Error loading hunts:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewHunt = async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunts')
        .insert({
          name: `Bonus Hunt ${new Date().toLocaleDateString('pt-PT')}`,
          status: 'active',
          show_on_main_overlay: false
        })
        .select()
        .single();

      if (error) throw error;

      await loadHunts();
      setSelectedHuntId(data.id);
      setView('detail');
    } catch (error) {
      console.error('Error creating hunt:', error);
      alert('Erro ao criar bonus hunt');
    }
  };

  const openHunt = (huntId: string) => {
    setSelectedHuntId(huntId);
    setView('detail');
  };

  const deleteHunt = async (huntId: string) => {
    if (!confirm('Tens a certeza que queres apagar esta hunt?')) return;

    try {
      await supabase.from('bonus_hunt_items').delete().eq('hunt_id', huntId);

      const { error } = await supabase
        .from('bonus_hunts')
        .delete()
        .eq('id', huntId);

      if (error) throw error;
      await loadHunts();
    } catch (error) {
      console.error('Error deleting hunt:', error);
      alert('Erro ao apagar hunt');
    }
  };

  const toggleOverlay = async (hunt: BonusHunt) => {
    try {
      const newValue = !hunt.show_on_main_overlay;

      if (newValue) {
        await supabase.from('bonus_hunts').update({ show_on_main_overlay: false }).neq('id', hunt.id);
        await supabase.from('bonus_openings').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('overlays').update({ is_active: false }).in('type', ['bonus_opening', 'chill']);

        const { data: huntOverlay } = await supabase
          .from('overlays')
          .select('id')
          .eq('type', 'bonus_hunt')
          .maybeSingle();

        if (huntOverlay) {
          await supabase.from('overlays').update({ is_active: true }).eq('id', huntOverlay.id);
        }
      }

      const { error } = await supabase
        .from('bonus_hunts')
        .update({
          show_on_main_overlay: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', hunt.id);

      if (error) throw error;
      await loadHunts();
    } catch (error) {
      console.error('Error toggling hunt overlay:', error);
      alert('Erro ao ativar a hunt');
    }
  };

  const filteredHunts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return hunts;
    }

    return hunts.filter((hunt) => {
      return (
        `#${hunt.hunt_number}`.toLowerCase().includes(normalizedQuery) ||
        (hunt.streamer_name || '').toLowerCase().includes(normalizedQuery) ||
        hunt.name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [hunts, searchQuery]);

  if (view === 'detail' && selectedHuntId) {
    return (
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-4" style={{ background: 'rgba(16, 23, 42, 0.82)', borderColor: 'rgba(51, 65, 85, 0.65)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2"
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Hunt List
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.22em]" style={{ color: '#60a5fa' }}>Management</p>
              <h2 className="text-lg font-black uppercase" style={{ color: '#f8fafc' }}>Bonus Hunt / Opening</h2>
            </div>
          </div>
        </div>

        <UnifiedBonusHuntController
          initialHuntId={selectedHuntId}
          onBackToList={() => setView('list')}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      <div className="rounded-3xl border px-6 py-6" style={{ background: 'linear-gradient(135deg, rgba(22, 22, 26, 0.96) 0%, rgba(28, 28, 34, 0.94) 100%)', borderColor: 'rgba(63, 63, 70, 0.7)' }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#60a5fa' }}>Bonus Hunt</p>
            <h1 className="text-2xl font-black uppercase" style={{ color: '#f8fafc' }}>Bonus Hunt List</h1>
          </div>

          <button
            onClick={createNewHunt}
            className="px-4 py-3 rounded-xl text-sm font-bold uppercase flex items-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', color: '#fff' }}
          >
            <Plus className="w-4 h-4" />
            New Hunt
          </button>
        </div>

        <div className="relative mt-5">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hunts, creator, or number"
            className="w-full rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none"
            style={{ background: '#232329', border: '1px solid #3a3a44', color: '#f8fafc' }}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm uppercase" style={{ color: '#94a3b8' }}>A carregar hunts...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredHunts.map((hunt) => {
            const breakEven = hunt.current_break_even > 0 ? hunt.current_break_even : hunt.initial_break_even;

            return (
              <div
                key={hunt.id}
                onClick={() => openHunt(hunt.id)}
                className="rounded-2xl border p-5 transition-all cursor-pointer"
                style={{ background: '#26262b', borderColor: 'rgba(82, 82, 91, 0.7)' }}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-3xl font-black leading-none" style={{ color: '#3b82f6' }}>#{hunt.hunt_number}</h3>
                    <p className="mt-3 text-sm" style={{ color: '#94a3b8' }}>
                      Created by: <span className="font-bold" style={{ color: '#f8fafc' }}>{hunt.streamer_name || 'fever'}</span>
                    </p>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>
                      Date: <span className="font-bold" style={{ color: '#f8fafc' }}>{new Date(hunt.created_at).toLocaleDateString('pt-PT')}</span>
                    </p>
                  </div>

                  {hunt.show_on_main_overlay && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.35)' }}>
                      Active
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-sm" style={{ color: '#94a3b8' }}>
                  <p>Bonuses: <span className="font-bold" style={{ color: '#f8fafc' }}>{hunt.bonus_count || 0}</span></p>
                  <p>Start: <span className="font-bold" style={{ color: '#f8fafc' }}>${hunt.total_invested.toFixed(2)}</span></p>
                  <p>BreakEven: <span className="font-bold" style={{ color: '#f8fafc' }}>{breakEven.toFixed(2)}x</span></p>
                </div>

                <div className="mt-5 pt-4 flex items-center gap-3" style={{ borderTop: '1px solid rgba(82, 82, 91, 0.45)' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteHunt(hunt.id);
                    }}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-bold uppercase flex items-center justify-center gap-2"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOverlay(hunt);
                    }}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-bold uppercase flex items-center justify-center gap-2"
                    style={{ background: '#60a5fa', color: '#fff' }}
                  >
                    <Play className="w-4 h-4" />
                    {hunt.show_on_main_overlay ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}