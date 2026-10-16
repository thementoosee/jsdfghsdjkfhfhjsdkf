import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { Coffee, X, TrendingUp, TrendingDown, Search, Monitor, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { searchSlotsCatalog, SLOT_SEARCH_DEBOUNCE_MS, resolveSlotImageUrl, SLOT_FALLBACK_IMAGE } from '../lib/slots-search';
import {
  filterChillBonusesBySlot,
  forgetChillBonusSlot,
  loadChillBonusSlotMap,
  rememberChillBonusSlot,
  saveChillBonusSlotMap,
  type ChillBonusSlotMap,
} from '../lib/chill-bonus-slot';
import {
  buildChillBonusInsertPayload,
  isMissingSlotColumnError,
  resetChillBonusSlotColumnCache,
} from '../lib/chill-bonus-persist';

/** Local admin visual tokens — isolated to Chill manager (not OBS overlays). */
const ch = {
  page: '#0f0f12',
  panel: '#141418',
  card: '#1c1c22',
  cardBorder: 'rgba(82, 82, 91, 0.55)',
  input: '#121218',
  inputBorder: 'rgba(63, 63, 70, 0.75)',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.16)',
  accentBorder: 'rgba(96, 165, 250, 0.35)',
  gold: '#fbbf24',
  goldMuted: 'rgba(251, 191, 36, 0.14)',
  goldBorder: 'rgba(251, 191, 36, 0.4)',
  success: '#22c55e',
  successMuted: 'rgba(34, 197, 94, 0.12)',
  successBorder: 'rgba(34, 197, 94, 0.35)',
  danger: '#ef4444',
  dangerMuted: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',
} as const;

const fieldStyle: CSSProperties = {
  background: ch.input,
  border: `1px solid ${ch.inputBorder}`,
  color: ch.text,
};

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
  /** Present after approved migration; optional until then. */
  slot_id?: string | null;
  slot_name?: string | null;
}

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url?: string;
  image_storage_path?: string | null;
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
  /** Compatibility map (localStorage) — kept alongside DB identity; not source of truth after migration. */
  const [bonusSlotMap, setBonusSlotMap] = useState<ChillBonusSlotMap>({});

  useEffect(() => {
    loadActiveSession();
  }, []);

  useEffect(() => {
    if (activeSession) {
      setBonusSlotMap(loadChillBonusSlotMap(activeSession.id));
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
    }, SLOT_SEARCH_DEBOUNCE_MS);

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
      const data = await searchSlotsCatalog(query);
      setSlots(data.map((s) => ({
        id: s.id,
        name: s.name,
        provider: s.provider,
        image_url: s.image_url ?? undefined,
        image_storage_path: s.image_storage_path ?? undefined,
      })));
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
          .select('id, name, provider, image_url, image_storage_path')
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

    const slotLabel = (selectedSlot?.name || activeSession.slot_name || '').trim();
    if (!slotLabel) {
      alert('Escolhe uma slot primeiro');
      return;
    }

    try {
      const betAmount = parseFloat(newBonus.bet);
      const winAmount = parseFloat(newBonus.win);
      const multiplier = winAmount / betAmount;

      const insertPayload = await buildChillBonusInsertPayload(
        {
          session_id: activeSession.id,
          bet_amount: betAmount,
          win_amount: winAmount,
          multiplier,
        },
        selectedSlot ? { id: selectedSlot.id, name: selectedSlot.name } : { name: slotLabel },
      );

      let { data, error } = await supabase
        .from('chill_bonuses')
        .insert(insertPayload)
        .select('id')
        .single();

      // Columns not deployed yet — retry without slot fields (payment must still save).
      if (error && isMissingSlotColumnError(error) && ('slot_id' in insertPayload || 'slot_name' in insertPayload)) {
        resetChillBonusSlotColumnCache();
        const legacy = await supabase
          .from('chill_bonuses')
          .insert({
            session_id: activeSession.id,
            bet_amount: betAmount,
            win_amount: winAmount,
            multiplier,
          })
          .select('id')
          .single();
        data = legacy.data;
        error = legacy.error;
      }

      if (error) throw error;

      if (data?.id) {
        setBonusSlotMap((current) => {
          const next = rememberChillBonusSlot(current, data.id, slotLabel);
          saveChillBonusSlotMap(activeSession.id, next);
          return next;
        });
      }

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

      if (activeSession) {
        setBonusSlotMap((current) => {
          const next = forgetChillBonusSlot(current, bonusId);
          saveChillBonusSlotMap(activeSession.id, next);
          return next;
        });
      }

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

  const overlayLive = Boolean(activeSession?.show_on_main_overlay);
  const canSaveBonus = Boolean(newBonus.bet && newBonus.win);
  const historySlotName = selectedSlot?.name || activeSession?.slot_name || '';
  const visibleBonuses = activeSession
    ? filterChillBonusesBySlot(bonuses, {
        selectedSlotId: selectedSlot?.id ?? null,
        selectedSlotName: historySlotName,
        localMap: bonusSlotMap,
      })
    : [];

  if (!activeSession) {
    return (
      <div className="min-h-full p-4 sm:p-6" style={{ background: ch.page, color: ch.text }}>
        <div className="max-w-3xl mx-auto space-y-5">
          <header
            className="rounded-2xl px-5 py-4 flex items-start gap-3"
            style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: ch.goldMuted, border: `1px solid ${ch.goldBorder}` }}
            >
              <Coffee className="w-5 h-5" style={{ color: ch.gold }} />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wide">Chill</h1>
              <p className="text-sm mt-0.5" style={{ color: ch.muted }}>
                Gestão de sessões e bónus
              </p>
            </div>
          </header>

          <section
            className="rounded-2xl p-5 space-y-5"
            style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
          >
            <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: ch.accentSoft }}>
              Iniciar sessão
            </h2>

            <SlotSearchField
              label="Escolhe a Slot"
              placeholder="Procura pela slot..."
              query={slotSearchQuery}
              onQueryChange={(v) => {
                setSlotSearchQuery(v);
                setShowSlotDropdown(true);
              }}
              onFocus={() => setShowSlotDropdown(true)}
              showDropdown={showSlotDropdown && slots.length > 0}
              slots={slots}
              onSelect={(slot) => {
                setSelectedSlot(slot);
                setSlotSearchQuery('');
                setShowSlotDropdown(false);
                setSlots([]);
              }}
            />

            {selectedSlot && (
              <div
                className="p-3 rounded-xl flex items-center gap-4"
                style={{ background: ch.card, border: `1px solid ${ch.cardBorder}` }}
              >
                <SlotThumb slot={selectedSlot} size={72} />
                <div className="min-w-0">
                  <div className="font-bold truncate" style={{ color: ch.text }}>
                    {selectedSlot.name}
                  </div>
                  <div className="text-sm truncate" style={{ color: ch.muted }}>
                    {selectedSlot.provider}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={startSession}
              disabled={!selectedSlot}
              className="w-full px-6 py-3.5 rounded-xl font-bold uppercase text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              style={{
                background: selectedSlot ? ch.accent : ch.card,
                border: `1px solid ${selectedSlot ? ch.accent : ch.cardBorder}`,
                color: selectedSlot ? '#fff' : ch.muted,
                opacity: selectedSlot ? 1 : 0.65,
              }}
            >
              <Coffee className="w-4 h-4" />
              Começar Sessão Chill
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6" style={{ background: ch.page, color: ch.text }}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <header
          className="rounded-2xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
          style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: ch.goldMuted, border: `1px solid ${ch.goldBorder}` }}
            >
              <Coffee className="w-5 h-5" style={{ color: ch.gold }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black uppercase tracking-wide">Chill</h1>
              <p className="text-sm mt-0.5" style={{ color: ch.muted }}>
                Gestão de sessões e bónus
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: overlayLive ? ch.successMuted : ch.card,
                    color: overlayLive ? ch.success : ch.muted,
                    border: `1px solid ${overlayLive ? ch.successBorder : ch.cardBorder}`,
                  }}
                >
                  {overlayLive ? 'Overlay ativo' : 'Sessão ativa'}
                </span>
                <span className="text-xs truncate" style={{ color: ch.muted }} title={activeSession.slot_name}>
                  {activeSession.slot_name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={overlayLive ? deactivateOverlay : activateOverlay}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide"
              style={{
                background: overlayLive ? ch.successMuted : ch.card,
                color: overlayLive ? ch.success : ch.text,
                border: `1px solid ${overlayLive ? ch.successBorder : ch.cardBorder}`,
              }}
            >
              <Monitor className="w-4 h-4" />
              {overlayLive ? 'Desativar' : 'Ativar'}
            </button>
            <button
              type="button"
              onClick={endSession}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide"
              style={{
                background: ch.dangerMuted,
                color: ch.danger,
                border: `1px solid ${ch.dangerBorder}`,
              }}
            >
              Terminar
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left column: slot + change + stats */}
          <div className="xl:col-span-7 space-y-4">
            <section
              className="rounded-2xl p-4 sm:p-5"
              style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
            >
              <div className="flex items-center gap-4">
                {selectedSlot ? (
                  <SlotThumb slot={selectedSlot} size={88} />
                ) : (
                  <div
                    className="rounded-xl flex-shrink-0"
                    style={{ width: 88, height: 88, background: ch.input, border: `1px solid ${ch.inputBorder}` }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ch.muted }}>
                    Slot atual
                  </div>
                  <h2 className="text-lg sm:text-xl font-black truncate mt-0.5" title={activeSession.slot_name}>
                    {activeSession.slot_name}
                  </h2>
                  {selectedSlot?.provider ? (
                    <p className="text-sm truncate mt-0.5" style={{ color: ch.muted }}>
                      {selectedSlot.provider}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4">
                <SlotSearchField
                  label="Mudar Slot"
                  placeholder="Procura para mudar a slot..."
                  query={slotSearchQuery}
                  onQueryChange={(v) => {
                    setSlotSearchQuery(v);
                    setShowSlotDropdown(true);
                  }}
                  onFocus={() => setShowSlotDropdown(true)}
                  showDropdown={showSlotDropdown && slots.length > 0}
                  slots={slots}
                  onSelect={changeSlot}
                />
              </div>
            </section>

            <section
              className={`grid gap-3 ${
                activeSession.total_bonuses > 0
                  ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                  : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              <StatTile label="Bónus" value={String(activeSession.total_bonuses)} />
              <StatTile label="Total Bet" value={`€${activeSession.total_bet.toFixed(2)}`} />
              <StatTile label="Total Ganho" value={`€${activeSession.total_won.toFixed(2)}`} />
              <StatTile
                label="Lucro"
                value={`€${profitLoss.toFixed(2)}`}
                tone={profitLoss >= 0 ? 'success' : 'danger'}
                icon={
                  profitLoss >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )
                }
              />
              {activeSession.total_bonuses > 0 && (
                <StatTile label="Multi. Médio" value={`${averageMultiplier.toFixed(2)}x`} tone="gold" />
              )}
            </section>
          </div>

          {/* Right: register bonus + history */}
          <div className="xl:col-span-5 space-y-4">
            <section
              className="rounded-2xl p-4 sm:p-5 space-y-4"
              style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
            >
              <h3 className="text-[11px] font-black uppercase tracking-widest" style={{ color: ch.accentSoft }}>
                Registar bónus
              </h3>

              <div className="flex items-center gap-3">
                {selectedSlot ? <SlotThumb slot={selectedSlot} size={56} /> : null}
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={activeSession.slot_name}
                    disabled
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-medium"
                    style={{ ...fieldStyle, opacity: 0.85 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: ch.muted }}>
                    Value
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={newBonus.bet}
                    onChange={(e) => setNewBonus({ ...newBonus, bet: e.target.value })}
                    placeholder="VALUE"
                    className="w-full px-3 py-3 rounded-xl text-sm text-center font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={fieldStyle}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: ch.muted }}>
                    Earning
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={newBonus.win}
                    onChange={(e) => setNewBonus({ ...newBonus, win: e.target.value })}
                    placeholder="EARNING"
                    className="w-full px-3 py-3 rounded-xl text-sm text-center font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={fieldStyle}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={addBonus}
                disabled={!canSaveBonus}
                className="w-full px-6 py-3 rounded-xl font-bold uppercase text-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                style={{
                  background: canSaveBonus ? ch.accent : ch.card,
                  color: canSaveBonus ? '#fff' : ch.muted,
                  border: `1px solid ${canSaveBonus ? ch.accent : ch.cardBorder}`,
                  opacity: canSaveBonus ? 1 : 0.6,
                }}
              >
                <Save className="w-4 h-4" />
                SAVE
              </button>
            </section>

            {visibleBonuses.length > 0 && (
              <section
                className="rounded-2xl p-4 sm:p-5"
                style={{ background: ch.panel, border: `1px solid ${ch.cardBorder}` }}
              >
                <h3
                  className="text-[11px] font-black uppercase tracking-widest mb-3"
                  style={{ color: ch.muted }}
                >
                  Histórico de bónus
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                  {visibleBonuses.map((bonus, index) => (
                    <div
                      key={bonus.id}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: ch.card, border: `1px solid ${ch.cardBorder}` }}
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                        style={{ background: ch.accentMuted, color: ch.accentSoft, border: `1px solid ${ch.accentBorder}` }}
                      >
                        {visibleBonuses.length - index}
                      </span>
                      <div className="min-w-0 flex-1 grid grid-cols-3 gap-2 text-center sm:text-left">
                        <div>
                          <div className="text-[9px] font-bold uppercase" style={{ color: ch.muted }}>
                            Value
                          </div>
                          <div className="text-sm font-bold truncate">€{bonus.bet_amount.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase" style={{ color: ch.muted }}>
                            Earning
                          </div>
                          <div className="text-sm font-bold truncate">€{bonus.win_amount.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase" style={{ color: ch.muted }}>
                            Multi
                          </div>
                          <div className="text-sm font-bold truncate" style={{ color: ch.gold }}>
                            {bonus.multiplier.toFixed(2)}x
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteBonus(bonus.id)}
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{
                          color: ch.danger,
                          background: ch.dangerMuted,
                          border: `1px solid ${ch.dangerBorder}`,
                        }}
                        aria-label="Apagar bonus"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotThumb({
  slot,
  size,
}: {
  slot: Slot;
  size: number;
}) {
  return (
    <img
      src={resolveSlotImageUrl(slot)}
      onError={(e) => {
        e.currentTarget.src = SLOT_FALLBACK_IMAGE;
      }}
      alt={slot.name}
      className="rounded-xl object-cover flex-shrink-0"
      style={{ width: size, height: size, border: `1px solid ${ch.cardBorder}` }}
    />
  );
}

function SlotSearchField({
  label,
  placeholder,
  query,
  onQueryChange,
  onFocus,
  showDropdown,
  slots,
  onSelect,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (v: string) => void;
  onFocus: () => void;
  showDropdown: boolean;
  slots: Slot[];
  onSelect: (slot: Slot) => void;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: ch.muted }}>
        {label}
      </label>
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: ch.muted }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
          style={fieldStyle}
        />
      </div>

      {showDropdown && (
        <div
          className="absolute z-20 w-full mt-2 rounded-xl shadow-xl max-h-72 overflow-y-auto"
          style={{ background: ch.card, border: `1px solid ${ch.cardBorder}` }}
        >
          {slots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelect(slot)}
              className="w-full text-left px-3 py-2.5 transition-colors border-b last:border-b-0 hover:bg-white/5"
              style={{ borderColor: ch.cardBorder }}
            >
              <div className="flex items-center gap-3">
                <SlotThumb slot={slot} size={48} />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate" style={{ color: ch.text }}>
                    {slot.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: ch.muted }}>
                    {slot.provider}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'gold';
  icon?: ReactNode;
}) {
  const toneStyles =
    tone === 'success'
      ? { bg: ch.successMuted, border: ch.successBorder, color: ch.success }
      : tone === 'danger'
        ? { bg: ch.dangerMuted, border: ch.dangerBorder, color: ch.danger }
        : tone === 'gold'
          ? { bg: ch.goldMuted, border: ch.goldBorder, color: ch.gold }
          : { bg: ch.panel, border: ch.cardBorder, color: ch.text };

  return (
    <div
      className="rounded-2xl px-3.5 py-3"
      style={{ background: toneStyles.bg, border: `1px solid ${toneStyles.border}` }}
    >
      <div className="flex items-center gap-1 mb-1" style={{ color: tone === 'default' ? ch.muted : toneStyles.color }}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-black truncate leading-tight" style={{ color: toneStyles.color }} title={value}>
        {value}
      </p>
    </div>
  );
}
