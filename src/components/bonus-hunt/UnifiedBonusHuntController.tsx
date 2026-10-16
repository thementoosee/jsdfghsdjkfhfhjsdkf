  import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { ArrowLeft, ArrowUpDown, Monitor, Plus, Trash2, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { calculateBE, calculateLiveBE, calculateTotalBetAll, formatMultiplier } from '../../lib/breakEvenCalculations';
import { searchSlotsCatalog, SLOT_SEARCH_DEBOUNCE_MS, resolveSlotImageUrl, resolveHistoricalSlotImage, SLOT_FALLBACK_IMAGE } from '../../lib/slots-search';

/** Local admin visual tokens — Bonus Hunt management only (not OBS overlays). */
const bh = {
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
  success: '#22c55e',
  danger: '#ef4444',
  dangerMuted: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',
} as const;

const fieldStyle: CSSProperties = {
  background: bh.input,
  border: `1px solid ${bh.inputBorder}`,
  color: bh.text,
};

interface BonusHunt {
  id: string;
  name: string;
  hunt_number: number;
  streamer_name: string | null;
  brand_logo_id: string | null;
  status: 'active' | 'opening' | 'completed';
  total_invested: number;
  total_won: number;
  initial_break_even: number;
  current_break_even: number;
  profit_loss: number;
  bonus_count: number;
  opened_count: number;
  created_at: string;
  show_on_main_overlay?: boolean;
  manual_investment?: boolean;
}

interface BonusHuntItem {
  id: string;
  hunt_id: string;
  slot_id?: string | null;
  slot_name: string;
  slot_image_url?: string;
  slots?: { image_storage_path?: string | null; image_url?: string | null } | null;
  bet_amount: number;
  payment_amount: number | null;
  result_amount: number | null;
  multiplier: number | null;
  status: 'pending' | 'opened';
  order_index: number;
  is_super_bonus: boolean;
  is_extreme_bonus: boolean;
}

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url?: string | null;
  image_storage_path?: string | null;
}

interface UnifiedBonusHuntControllerProps {
  initialHuntId?: string;
  onBackToList?: () => void;
}

export function UnifiedBonusHuntController({ initialHuntId, onBackToList }: UnifiedBonusHuntControllerProps = {}) {
  const [hunts, setHunts] = useState<BonusHunt[]>([]);
  const [selectedHunt, setSelectedHunt] = useState<BonusHunt | null>(null);
  const [items, setItems] = useState<BonusHuntItem[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSlotDropdown, setShowSlotDropdown] = useState(false);
  const [slotSearchQuery, setSlotSearchQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [startValue, setStartValue] = useState<number>(0);
  const selectedHuntIdRef = useRef<string | null>(null);

  const [newItem, setNewItem] = useState({
    slot_name: '',
    bet_amount: '',
    is_super_bonus: false,
    is_extreme_bonus: false,
  });

  useEffect(() => {
    loadHunts();

    const channel = supabase
      .channel('unified_bonus_hunt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunts' }, () => {
        loadHunts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunt_items' }, () => {
        if (selectedHuntIdRef.current) {
          loadHuntItems();
          loadHunt();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchSlots(slotSearchQuery);
    }, SLOT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [slotSearchQuery]);

  const loadHunts = async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHunts(data || []);

      if (data && data.length > 0) {
        const preferredHunt = initialHuntId
          ? data.find((hunt) => hunt.id === initialHuntId) || data[0]
          : data[0];

        if (!selectedHunt || (initialHuntId && selectedHunt.id !== initialHuntId)) {
          setSelectedHunt(preferredHunt);
        }
      }
    } catch (error) {
      console.error('Error loading hunts:', error);
    }
  };

  const loadHunt = async () => {
    const huntId = selectedHuntIdRef.current;
    if (!huntId) return;
    try {
      const { data, error } = await supabase
        .from('bonus_hunts')
        .select('*')
        .eq('id', huntId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSelectedHunt(data);
      }
    } catch (error) {
      console.error('Error loading hunt:', error);
    }
  };

  const loadHuntItems = async () => {
    const huntId = selectedHuntIdRef.current;
    if (!huntId) return;
    try {
      const { data, error } = await supabase
        .from('bonus_hunt_items')
        .select('*, slots:slot_id(image_storage_path, image_url)')
        .eq('hunt_id', huntId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  /** Keep BONUS LIST ordered by bet: lowest → highest. */
  const reorderItemsByBetAsc = async (huntId: string) => {
    const { data, error } = await supabase
      .from('bonus_hunt_items')
      .select('id, bet_amount, order_index')
      .eq('hunt_id', huntId);

    if (error) throw error;
    if (!data?.length) return;

    const sorted = [...data].sort((a, b) => {
      const betDiff = Number(a.bet_amount) - Number(b.bet_amount);
      if (betDiff !== 0) return betDiff;
      return a.order_index - b.order_index;
    });

    const updates = sorted
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => item.order_index !== index);

    if (!updates.length) return;

    await Promise.all(
      updates.map(({ item, index }) =>
        supabase
          .from('bonus_hunt_items')
          .update({ order_index: index })
          .eq('id', item.id)
      )
    );
  };

  useEffect(() => {
    selectedHuntIdRef.current = selectedHunt?.id ?? null;
    if (!selectedHunt) return;

    void (async () => {
      try {
        await reorderItemsByBetAsc(selectedHunt.id);
      } catch (error) {
        console.error('Error auto-sorting hunt by bet:', error);
      }
      await loadHuntItems();
      setStartValue(selectedHunt.total_invested ?? 0);
    })();
  }, [selectedHunt?.id]);

  useEffect(() => {
    if (!initialHuntId || hunts.length === 0) return;

    const matchingHunt = hunts.find((hunt) => hunt.id === initialHuntId);
    if (matchingHunt && selectedHunt?.id !== matchingHunt.id) {
      setSelectedHunt(matchingHunt);
    }
  }, [initialHuntId, hunts, selectedHunt?.id]);

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

  const updatePayment = async (itemId: string, value: string) => {
    const trimmedValue = value.trim();
    const parsedValue = trimmedValue === '' ? null : Number(trimmedValue);

    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      return;
    }

    const normalizedPayment = parsedValue === null ? null : parsedValue;
    const targetItem = items.find((item) => item.id === itemId);
    const computedMultiplier = targetItem && normalizedPayment !== null && targetItem.bet_amount > 0
      ? normalizedPayment / targetItem.bet_amount
      : null;

    // Align with DB trigger update_bonus_hunt_totals: total_won uses result_amount where status='opened'.
    // Persist opened + result_amount so Statistics/TOP5 update without ending the Opening.
    const opened = normalizedPayment !== null && normalizedPayment > 0;
    const nextStatus: 'pending' | 'opened' = opened ? 'opened' : 'pending';
    const nextResult = opened ? normalizedPayment : null;

    // Optimistic update keeps sidebar stats and Live BE responsive while DB update completes.
    setItems((currentItems) => currentItems.map((item) => (
      item.id === itemId
        ? {
            ...item,
            payment_amount: normalizedPayment,
            multiplier: computedMultiplier,
            result_amount: nextResult,
            status: nextStatus,
          }
        : item
    )));

    try {
      const { error } = await supabase
        .from('bonus_hunt_items')
        .update({
          payment_amount: normalizedPayment,
          multiplier: computedMultiplier,
          result_amount: nextResult,
          status: nextStatus,
          ...(opened ? { opened_at: new Date().toISOString() } : { opened_at: null }),
        })
        .eq('id', itemId);

      if (error) throw error;
      await loadHuntItems();
      await loadHunt();
    } catch (error) {
      console.error('Error updating payment:', error);
      alert('Erro ao atualizar pagamento');
      await loadHuntItems();
    }
  };

  const removeBonus = async (itemId: string) => {
    if (!confirm('Tens a certeza que queres remover este bonus?')) return;

    try {
      const { error } = await supabase
        .from('bonus_hunt_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      if (selectedHuntIdRef.current) {
        await reorderItemsByBetAsc(selectedHuntIdRef.current);
      }
      await loadHuntItems();
    } catch (error) {
      console.error('Error removing bonus:', error);
      alert('Erro ao remover bonus');
    }
  };

  const addBonusToHunt = async () => {
    if (!selectedHunt) return;

    if (selectedHunt.status !== 'active') {
      alert('Só podes adicionar slots quando a hunt está em modo "Ativa"');
      return;
    }

    const slotName = (newItem.slot_name || slotSearchQuery).trim();
    const betAmount = Number(newItem.bet_amount);

    if (!slotName || !Number.isFinite(betAmount) || betAmount <= 0) {
      return;
    }

    setLoading(true);
    try {
      const nextIndex = items.length;

      let slotForImage: Slot | null = selectedSlot;
      let slotId = selectedSlot?.id || null;
      if (!slotForImage && slotName) {
        const { data: slotData } = await supabase
          .from('slots')
          .select('id, name, provider, image_url, image_storage_path')
          .eq('name', slotName)
          .maybeSingle();
        if (slotData) {
          slotForImage = slotData as Slot;
          slotId = slotData.id || slotId;
        }
      }
      const slotImageUrl = slotForImage ? resolveSlotImageUrl(slotForImage) : SLOT_FALLBACK_IMAGE;

      const { error } = await supabase
        .from('bonus_hunt_items')
        .insert({
          hunt_id: selectedHunt.id,
          slot_id: slotId,
          slot_name: slotName,
          slot_image_url: slotImageUrl,
          bet_amount: betAmount,
          payment_amount: null,
          order_index: nextIndex,
          status: 'pending',
          is_super_bonus: newItem.is_super_bonus,
          is_extreme_bonus: newItem.is_extreme_bonus,
        });

      if (error) throw error;

      setNewItem({ slot_name: '', bet_amount: '', is_super_bonus: false, is_extreme_bonus: false });
      setSelectedSlot(null);
      setSlotSearchQuery('');
      await reorderItemsByBetAsc(selectedHunt.id);
      await loadHuntItems();
    } catch (error) {
      console.error('Error adding bonus:', error);
      alert('Erro ao adicionar bonus');
    } finally {
      setLoading(false);
    }
  };

  const toggleOverlay = async () => {
    if (!selectedHunt) return;

    try {
      const newValue = !selectedHunt.show_on_main_overlay;

      if (newValue) {
        await supabase.from('bonus_hunts').update({ show_on_main_overlay: false }).neq('id', selectedHunt.id);
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

      await supabase
        .from('bonus_hunts')
        .update({ show_on_main_overlay: newValue, updated_at: new Date().toISOString() })
        .eq('id', selectedHunt.id);

      await loadHunt();
    } catch (error) {
      console.error('Error toggling overlay:', error);
      alert('Erro ao ativar/desativar overlay');
    }
  };

  const startOpening = async () => {
    if (!selectedHunt) return;

    try {
      await supabase
        .from('bonus_hunts')
        .update({
          status: 'opening',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedHunt.id);

      const { data: overlay } = await supabase
        .from('overlays')
        .select('id')
        .eq('type', 'hunt')
        .maybeSingle();

      if (!overlay) {
        await supabase
          .from('overlays')
          .insert({
            type: 'hunt',
            name: 'Bonus Hunt Overlay',
            config: {
              backgroundColor: '#10b981',
              textColor: '#ffffff',
              accentColor: '#059669'
            },
            is_active: true
          });
      } else {
        await supabase.from('overlays').update({ is_active: true }).eq('id', overlay.id);
      }

      await loadHunt();
    } catch (error) {
      console.error('Error starting opening:', error);
      alert('Erro ao iniciar abertura');
    }
  };

  const stopOpening = async () => {
    if (!selectedHunt) return;

    try {
      await supabase
        .from('bonus_hunts')
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedHunt.id);

      await loadHunt();
    } catch (error) {
      console.error('Error stopping opening:', error);
      alert('Erro ao voltar para hunt');
    }
  };

  const updateSelectedHuntField = async (
    field: 'total_invested' | 'streamer_name',
    value: number | string | null
  ) => {
    if (!selectedHunt) return;

    const normalizedValue = field === 'total_invested'
      ? Math.max(0, Number(value) || 0)
      : String(value || '').trim();

    setSelectedHunt((current) => current ? {
      ...current,
      [field]: normalizedValue
    } : current);

    try {
      const updatePayload: Record<string, string | number | boolean> = {
        [field]: normalizedValue,
        updated_at: new Date().toISOString()
      };

      if (field === 'total_invested') {
        updatePayload.manual_investment = true;
      }

      const { error } = await supabase
        .from('bonus_hunts')
        .update(updatePayload)
        .eq('id', selectedHunt.id);

      if (error) throw error;
      await loadHunt();
    } catch (error) {
      console.error(`Error updating hunt ${field}:`, error);
      alert('Erro ao atualizar dados da hunt');
      await loadHunt();
    }
  };

  if (!selectedHunt) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" style={{ background: bh.page }}>
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4"
            style={{ borderColor: bh.accentSoft }}
          />
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: bh.muted }}>
            A carregar...
          </p>
        </div>
      </div>
    );
  }

  const totalBetAll = calculateTotalBetAll(items);
  const be = calculateBE(startValue, totalBetAll);
  const liveBE = calculateLiveBE(items, startValue);

  const totalCount = items.length;
  const openedCount = items.filter(i => i.payment_amount && i.payment_amount > 0).length;

  const average = (() => {
    const openedItems = items.filter(item => item.multiplier !== null && item.multiplier !== undefined);
    if (openedItems.length === 0) return '0.00x';
    const totalMultiplier = openedItems.reduce((sum, item) => sum + (item.multiplier || 0), 0);
    return `${(totalMultiplier / openedItems.length).toFixed(2)}x`;
  })();

  const totalWon = items
    .filter(i => i.payment_amount && i.payment_amount > 0)
    .reduce((sum, i) => sum + (i.payment_amount || 0), 0);
  const averagePay = openedCount > 0 ? totalWon / openedCount : 0;
  const profitLoss = totalWon - startValue;
  const canAddNewBonus = (newItem.slot_name || slotSearchQuery).trim().length > 0 && Number(newItem.bet_amount) > 0;

  return (
    <div
      className="w-full flex flex-col lg:flex-row lg:items-start gap-5"
      style={{ background: bh.page, color: bh.text }}
    >
      {/* LEFT SIDEBAR — grows naturally; page scroll only (no internal overflow) */}
      <aside
        className="w-full lg:w-[22rem] xl:w-96 2xl:max-w-[26rem] 2xl:w-[26rem] shrink-0 rounded-2xl border p-5 flex flex-col"
        style={{ background: bh.panel, borderColor: bh.cardBorder }}
      >
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="mb-4 w-full px-3 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
              style={{ background: bh.card, border: `1px solid ${bh.cardBorder}`, color: bh.text }}
            >
              <ArrowLeft className="w-4 h-4" style={{ color: bh.accentSoft }} />
              Hunt List
            </button>
          )}

          <div
            className="rounded-2xl border p-5 flex flex-col gap-5"
            style={{ background: bh.card, borderColor: bh.cardBorder }}
          >
            <div>
              <h3 className="text-center text-sm font-black mb-3 uppercase tracking-wide" style={{ color: bh.accentSoft }}>
                Stats
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase shrink-0" style={{ color: bh.muted }}>Start</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={startValue === 0 ? '' : startValue}
                    placeholder="0"
                    onChange={(e) => setStartValue(Math.max(0, Number(e.target.value) || 0))}
                    onBlur={(e) => updateSelectedHuntField('total_invested', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-28 min-w-0 flex-1 max-w-[9rem] px-2.5 py-2 rounded-lg font-semibold text-sm text-right focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={fieldStyle}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase shrink-0" style={{ color: bh.muted }}>Creator</span>
                  <input
                    key={`${selectedHunt.id}-creator-${selectedHunt.streamer_name || ''}`}
                    type="text"
                    defaultValue={selectedHunt.streamer_name || ''}
                    placeholder=""
                    onBlur={(e) => updateSelectedHuntField('streamer_name', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateSelectedHuntField('streamer_name', (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-28 min-w-0 flex-1 max-w-[9rem] px-2.5 py-2 rounded-lg font-semibold text-sm text-right focus:outline-none focus:ring-2"
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 border" style={{ background: bh.panel, borderColor: bh.cardBorder }}>
              <h4 className="text-center text-[10px] font-black mb-3 uppercase tracking-widest" style={{ color: bh.accentSoft }}>Bonuses</h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Total</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{totalCount}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Opened</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{openedCount}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Supers</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{items.filter(i => i.is_super_bonus).length}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Extreme</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.danger }}>{items.filter(i => i.is_extreme_bonus).length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 border" style={{ background: bh.panel, borderColor: bh.cardBorder }}>
              <h4 className="text-center text-[10px] font-black mb-3 uppercase tracking-widest" style={{ color: bh.accentSoft }}>Break Even</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>BE</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{formatMultiplier(be)}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Live BE</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{formatMultiplier(liveBE)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 border" style={{ background: bh.panel, borderColor: bh.cardBorder }}>
              <h4 className="text-center text-[10px] font-black mb-3 uppercase tracking-widest" style={{ color: bh.accentSoft }}>Average</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Multi(x)</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>{average}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Pay($)</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>${averagePay.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 border" style={{ background: bh.panel, borderColor: bh.cardBorder }}>
              <h4 className="text-center text-[10px] font-black mb-3 uppercase tracking-widest" style={{ color: bh.accentSoft }}>Total Pay</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Pay($)</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: bh.text }}>${totalWon.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: bh.muted }}>Profit($)</div>
                  <div className="rounded-lg py-2 border" style={{ background: bh.card, borderColor: bh.cardBorder }}>
                    <span className="font-bold text-sm" style={{ color: profitLoss >= 0 ? bh.success : bh.danger }}>
                      ${profitLoss >= 0 ? '' : '-'}{Math.abs(profitLoss).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <button
                onClick={async () => {
                  if (!selectedHunt) return;
                  await reorderItemsByBetAsc(selectedHunt.id);
                  await loadHuntItems();
                }}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all text-xs font-bold uppercase"
                style={{ background: bh.panel, borderColor: bh.cardBorder, color: bh.muted }}
              >
                <ArrowUpDown size={14} />
                Order
              </button>
              <button
                onClick={toggleOverlay}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all text-xs font-bold uppercase"
                style={{
                  background: bh.panel,
                  borderColor: selectedHunt.show_on_main_overlay ? bh.dangerBorder : bh.cardBorder,
                  color: selectedHunt.show_on_main_overlay ? bh.danger : bh.accentSoft,
                }}
              >
                <Monitor size={14} />
                {selectedHunt.show_on_main_overlay ? 'Active' : 'Activate'}
              </button>
              <button
                onClick={selectedHunt.status === 'opening' ? stopOpening : startOpening}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all text-xs font-bold uppercase"
                style={{
                  background: selectedHunt.status === 'opening' ? bh.dangerMuted : bh.accentMuted,
                  borderColor: selectedHunt.status === 'opening' ? bh.dangerBorder : bh.accentBorder,
                  color: selectedHunt.status === 'opening' ? bh.danger : bh.accentSoft,
                }}
              >
                <BarChart3 size={14} />
                {selectedHunt.status === 'opening' ? 'Stop' : 'Start'}
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div
          className="flex-1 min-w-0 w-full flex flex-col rounded-2xl border"
          style={{ background: bh.panel, borderColor: bh.cardBorder }}
        >
          <div className="p-4 sm:p-5 border-b" style={{ borderBottomColor: bh.cardBorder }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: bh.accentMuted, border: `1px solid ${bh.accentBorder}` }}
              >
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: bh.accentSoft }} />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-wide" style={{ color: bh.text }}>
                  Bonus Hunt #{selectedHunt.hunt_number}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: bh.muted }}>
                  Status:{' '}
                  <span className="font-bold uppercase" style={{ color: bh.accentSoft }}>
                    {selectedHunt.status === 'active' ? 'Bonus Hunt' : selectedHunt.status}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            {selectedHunt.status === 'active' && (
              <div className="px-4 py-3 border-b" style={{ background: bh.card, borderBottomColor: bh.cardBorder }}>
                <div className="flex items-center gap-2">
                  {selectedSlot && (
                    <div className="flex-shrink-0">
                      <img
                        src={resolveSlotImageUrl(selectedSlot)}
                        alt={selectedSlot.name}
                        className="w-6 h-8 rounded-lg object-contain"
                        style={{ border: `1px solid ${bh.cardBorder}` }}
                        onError={(e) => { e.currentTarget.src = SLOT_FALLBACK_IMAGE; }}
                      />
                    </div>
                  )}

                  <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={slotSearchQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSlotSearchQuery(value);
                        setNewItem((current) => ({ ...current, slot_name: value }));
                        setShowSlotDropdown(true);
                        searchSlots(value);
                      }}
                      onFocus={() => {
                        setShowSlotDropdown(true);
                        if (slotSearchQuery) {
                          searchSlots(slotSearchQuery);
                        }
                      }}
                      placeholder="Select a slot"
                      className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                      style={fieldStyle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setShowSlotDropdown(false);
                          addBonusToHunt();
                        }
                      }}
                    />
                    {showSlotDropdown && slots.length > 0 && (
                      <div
                        className="absolute z-10 w-full mt-1 rounded-xl shadow-lg max-h-60 overflow-y-auto"
                        style={{ background: bh.panel, border: `1px solid ${bh.cardBorder}` }}
                      >
                        {slots.map(slot => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={async () => {
                              const { data: slotData } = await supabase
                                .from('slots')
                                .select('*')
                                .eq('id', slot.id)
                                .maybeSingle();

                              if (slotData) {
                                setSelectedSlot(slotData);
                                setNewItem((current) => ({ ...current, slot_name: slotData.name }));
                                setSlotSearchQuery(slotData.name);
                              }
                              setShowSlotDropdown(false);
                              setSlots([]);
                            }}
                            className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors"
                            style={{ borderBottomColor: bh.cardBorder, color: bh.text }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = bh.card; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div className="font-semibold">{slot.name}</div>
                            <div className="text-xs" style={{ color: bh.muted }}>{slot.provider}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    value={newItem.bet_amount}
                    onChange={(e) => setNewItem((current) => ({ ...current, bet_amount: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addBonusToHunt(); }}
                    placeholder="-"
                    className="w-24 px-3 py-2 rounded-xl text-sm text-center focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={fieldStyle}
                  />

                  <button
                    type="button"
                    onClick={() => setNewItem((current) => ({ ...current, is_super_bonus: !current.is_super_bonus }))}
                    className="px-2.5 py-2 rounded-xl text-xs font-bold uppercase transition-all"
                    style={{
                      background: newItem.is_super_bonus ? bh.accentMuted : bh.input,
                      border: `1px solid ${newItem.is_super_bonus ? bh.accentBorder : bh.inputBorder}`,
                      color: newItem.is_super_bonus ? bh.accentSoft : bh.muted,
                    }}
                  >
                    Super
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewItem((current) => ({ ...current, is_extreme_bonus: !current.is_extreme_bonus }))}
                    className="px-2.5 py-2 rounded-xl text-xs font-bold uppercase transition-all"
                    style={{
                      background: newItem.is_extreme_bonus ? bh.dangerMuted : bh.input,
                      border: `1px solid ${newItem.is_extreme_bonus ? bh.dangerBorder : bh.inputBorder}`,
                      color: newItem.is_extreme_bonus ? bh.danger : bh.muted,
                    }}
                  >
                    Extreme
                  </button>

                  <button
                    onClick={addBonusToHunt}
                    disabled={loading || !canAddNewBonus}
                    className="p-2 rounded-xl transition-colors flex items-center justify-center disabled:opacity-50"
                    style={{ background: bh.success, color: '#fff' }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="min-w-0 overflow-x-auto" style={{ background: bh.panel }}>
              <div className="min-w-[640px]">
              <div
                className="grid grid-cols-[52px_minmax(0,1fr)_110px_130px_120px_48px] gap-3 px-4 sm:px-5 py-3 border-b sticky top-0 z-10"
                style={{ background: bh.card, borderBottomColor: bh.cardBorder }}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: bh.muted }}>#</div>
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: bh.muted }}>Slot</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: bh.muted }}>Bet</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: bh.muted }}>Earning</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: bh.muted }}>Multi</div>
                <div></div>
              </div>

              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[52px_minmax(0,1fr)_110px_130px_120px_48px] gap-3 px-4 sm:px-5 py-2.5 border-b items-center transition-colors"
                  style={{
                    borderBottomColor: bh.cardBorder,
                    background: item.payment_amount && item.payment_amount > 0 ? bh.card : 'transparent',
                  }}
                >
                  <div className="text-xs font-bold text-center" style={{ color: bh.muted }}>#{index + 1}</div>

                  <div className="flex items-center gap-3">
                    <img
                      src={resolveHistoricalSlotImage({
                        slot: item.slots,
                        snapshotUrl: item.slot_image_url,
                      })}
                      alt={item.slot_name}
                      className="w-8 h-10 rounded-lg object-cover flex-shrink-0"
                      style={{ border: `1px solid ${bh.cardBorder}` }}
                      onError={(e) => { e.currentTarget.src = SLOT_FALLBACK_IMAGE; }}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: bh.text }}>{item.slot_name}</span>
                      {item.is_super_bonus && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ background: bh.accentMuted, border: `1px solid ${bh.accentBorder}`, color: bh.accentSoft }}
                        >
                          Super
                        </span>
                      )}
                      {item.is_extreme_bonus && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ background: bh.dangerMuted, border: `1px solid ${bh.dangerBorder}`, color: bh.danger }}
                        >
                          Extreme
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-sm font-semibold" style={{ color: bh.text }}>${item.bet_amount.toFixed(2)}</span>
                  </div>

                  <div className="text-center">
                    {selectedHunt.status === 'opening' ? (
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        defaultValue={item.payment_amount || ''}
                        onBlur={(e) => {
                          updatePayment(item.id, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg text-sm text-center focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={fieldStyle}
                      />
                    ) : (
                      <span className="text-sm font-semibold" style={{ color: bh.text }}>
                        {item.payment_amount ? `$${item.payment_amount.toFixed(2)}` : '-'}
                      </span>
                    )}
                  </div>

                  <div className="text-center">
                    <span className="text-sm font-semibold" style={{ color: bh.accentSoft }}>
                      {item.multiplier !== null && item.multiplier !== undefined ? `${item.multiplier.toFixed(2)}x` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    {selectedHunt.status === 'active' && (
                      <button
                        onClick={() => removeBonus(item.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: bh.muted }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = bh.danger; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = bh.muted; }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
