  import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowUpDown, Monitor, Plus, Trash2, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { calculateBE, calculateLiveBE, calculateTotalBetAll, formatMultiplier } from '../../lib/breakEvenCalculations';

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
  slot_name: string;
  slot_image_url?: string;
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
  image_url?: string;
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
    }, 300);
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
        .select('*')
        .eq('hunt_id', huntId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  useEffect(() => {
    selectedHuntIdRef.current = selectedHunt?.id ?? null;
    if (selectedHunt) {
      loadHuntItems();
      setStartValue(selectedHunt.total_invested ?? 0);
    }
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

    // Optimistic update keeps sidebar stats and Live BE responsive while DB update completes.
    setItems((currentItems) => currentItems.map((item) => (
      item.id === itemId
        ? { ...item, payment_amount: normalizedPayment, multiplier: computedMultiplier }
        : item
    )));

    try {
      const { error } = await supabase
        .from('bonus_hunt_items')
        .update({ payment_amount: normalizedPayment, multiplier: computedMultiplier })
        .eq('id', itemId);

      if (error) throw error;
      await loadHuntItems();
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

      let slotImageUrl = null;
      if (slotName) {
        const { data: slotData } = await supabase
          .from('slots')
          .select('image_url')
          .eq('name', slotName)
          .maybeSingle();
        slotImageUrl = slotData?.image_url || null;
      }

      const { error } = await supabase
        .from('bonus_hunt_items')
        .insert({
          hunt_id: selectedHunt.id,
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
      await loadHuntItems();
    } catch (error) {
      console.error('Error adding bonus:', error);
      alert('Erro ao adicionar bonus');
    } finally {
      setLoading(false);
    }
  };

  const createNewHunt = async () => {
    try {
      setLoading(true);

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

      await new Promise(resolve => setTimeout(resolve, 300));
      await loadHunts();
      setSelectedHunt(data);
    } catch (error) {
      console.error('Error creating hunt:', error);
      alert('Erro ao criar bonus hunt');
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-400 uppercase">A carregar...</p>
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
    <div className="w-full h-[calc(100vh-88px)] overflow-hidden flex gap-4 p-4" style={{ background: 'linear-gradient(to bottom, #1a1a1a 0%, #0f0f0f 100%)', color: '#d4d4d4' }}>
        {/* LEFT SIDEBAR */}
      <div className="w-72 rounded-xl border p-4 flex flex-col overflow-y-auto" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="mb-4 w-full px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Hunt List
            </button>
          )}

          
          <div className="rounded-2xl border p-4 flex flex-col space-y-4" style={{ background: 'linear-gradient(135deg, #252525 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
            <div>
              <h3 className="text-center text-sm font-bold mb-3 uppercase" style={{ color: '#b89968' }}>Stats</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">Start:</span>
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
                    className="w-24 px-2 py-1 border rounded font-semibold text-xs text-right focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ background: '#1f1f1f', borderColor: '#3a3a3a', color: '#d4d4d4' }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">Creator:</span>
                  <input
                    key={`${selectedHunt.id}-creator-${selectedHunt.streamer_name || ''}`}
                    type="text"
                    defaultValue={selectedHunt.streamer_name || ''}
                    placeholder="fever"
                    onBlur={(e) => updateSelectedHuntField('streamer_name', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateSelectedHuntField('streamer_name', (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-24 px-2 py-1 border rounded font-semibold text-xs text-right focus:outline-none"
                    style={{ background: '#1f1f1f', borderColor: '#3a3a3a', color: '#d4d4d4' }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 border" style={{ background: '#1f1f1f', borderColor: '#3a3a3a' }}>
              <h4 className="text-center text-xs font-bold mb-2 uppercase" style={{ color: '#b89968' }}>Bonuses</h4>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Total</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{totalCount}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Opened</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{openedCount}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Supers</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{items.filter(i => i.is_super_bonus).length}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1.5 mt-1.5">
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Extreme</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="font-bold text-sm" style={{ color: '#ef4444' }}>{items.filter(i => i.is_extreme_bonus).length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 border" style={{ background: '#1f1f1f', borderColor: '#3a3a3a' }}>
              <h4 className="text-center text-xs font-bold mb-2 uppercase" style={{ color: '#b89968' }}>Break Even</h4>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">BE</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{formatMultiplier(be)}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Live BE</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{formatMultiplier(liveBE)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 border" style={{ background: '#1f1f1f', borderColor: '#3a3a3a' }}>
              <h4 className="text-center text-xs font-bold mb-2 uppercase" style={{ color: '#b89968' }}>Average</h4>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Multi(x)</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">{average}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Pay($)</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">${averagePay.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 border" style={{ background: '#1f1f1f', borderColor: '#3a3a3a' }}>
              <h4 className="text-center text-xs font-bold mb-2 uppercase" style={{ color: '#b89968' }}>Total Pay</h4>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Pay($)</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className="text-white font-bold text-sm">${totalWon.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Profit($)</div>
                  <div className="rounded py-1.5 border" style={{ background: '#2a2a2a', borderColor: '#3a3a3a' }}>
                    <span className={`font-bold text-sm ${profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${profitLoss >= 0 ? '' : '-'}${Math.abs(profitLoss).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={async () => {
                  const sortedItems = [...items].sort((a, b) => (b.payment_amount || b.bet_amount) - (a.payment_amount || a.bet_amount));
                  for (let i = 0; i < sortedItems.length; i++) {
                    await supabase
                      .from('bonus_hunt_items')
                      .update({ order_index: i })
                      .eq('id', sortedItems[i].id);
                  }
                  await loadHuntItems();
                }}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs font-medium uppercase"
                style={{ background: '#2a2a2a', borderColor: '#3d3d3d', color: '#a8a8a8' }}
              >
                <ArrowUpDown size={14} />
                Order
              </button>
              <button
                onClick={toggleOverlay}
                className={`${selectedHunt.show_on_main_overlay ? 'text-red-400' : 'text-[#b89968]'} flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs font-medium uppercase`}
                style={{ background: '#2a2a2a', borderColor: selectedHunt.show_on_main_overlay ? 'rgba(239,68,68,0.45)' : '#3d3d3d' }}
              >
                <Monitor size={14} />
                {selectedHunt.show_on_main_overlay ? 'Active' : 'Activate'}
              </button>
              <button
                onClick={selectedHunt.status === 'opening' ? stopOpening : startOpening}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs font-medium uppercase"
                style={{
                  background: '#2a2a2a',
                  borderColor: selectedHunt.status === 'opening' ? 'rgba(239,68,68,0.45)' : '#3d3d3d',
                  color: selectedHunt.status === 'opening' ? '#f87171' : '#b89968'
                }}
              >
                <BarChart3 size={14} />
                {selectedHunt.status === 'opening' ? 'Stop' : 'Start'}
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-hidden flex flex-col rounded-xl border" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
          <div className="p-4 border-b" style={{ borderBottomColor: '#3a3a3a' }}>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#b89968' }}>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#b89968' }} />
              </div>
              <h2 className="text-lg font-bold text-white">Bonus Hunt #{selectedHunt.hunt_number}</h2>
              <span className="ml-auto text-sm text-slate-400">
                Status: <span className="text-white font-semibold capitalize">{selectedHunt.status === 'active' ? 'Bonus Hunt' : selectedHunt.status}</span>
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedHunt.status === 'active' && (
              <div className="px-4 py-2 border-b" style={{ background: '#1f1f1f', borderBottomColor: '#3a3a3a' }}>
                <div className="flex items-center gap-2">
                  {selectedSlot && (
                    <div className="flex-shrink-0">
                      <img
                        src={selectedSlot.image_url}
                        alt={selectedSlot.name}
                        className="w-6 h-8 rounded object-contain"
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
                      className="w-full px-3 py-1.5 text-white rounded text-sm placeholder-slate-500 focus:outline-none"
                      style={{ background: '#2a2a2a', border: '1px solid #3a3a3a' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setShowSlotDropdown(false);
                          addBonusToHunt();
                        }
                      }}
                    />
                    {showSlotDropdown && slots.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ background: '#1f1f1f', border: '1px solid #3a3a3a' }}>
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
                            className="w-full text-left px-3 py-2 hover:bg-[#2a2a2a] text-sm border-b last:border-b-0"
                            style={{ borderBottomColor: '#3a3a3a' }}
                          >
                            <div className="font-semibold text-white">{slot.name}</div>
                            <div className="text-xs text-slate-400">{slot.provider}</div>
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
                    className="w-24 px-3 py-1.5 text-white rounded text-sm text-center placeholder-slate-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ background: '#2a2a2a', border: '1px solid #3a3a3a' }}
                  />

                  {/* Super toggle */}
                  <button
                    type="button"
                    onClick={() => setNewItem((current) => ({ ...current, is_super_bonus: !current.is_super_bonus }))}
                    className="px-2 py-1.5 rounded text-xs font-bold uppercase transition-all"
                    style={{
                      background: newItem.is_super_bonus ? '#b89968' : '#2a2a2a',
                      border: `1px solid ${newItem.is_super_bonus ? '#b89968' : '#3a3a3a'}`,
                      color: newItem.is_super_bonus ? '#0f0f0f' : '#8a8a8a',
                    }}
                  >
                    Super
                  </button>

                  {/* Extreme toggle */}
                  <button
                    type="button"
                    onClick={() => setNewItem((current) => ({ ...current, is_extreme_bonus: !current.is_extreme_bonus }))}
                    className="px-2 py-1.5 rounded text-xs font-bold uppercase transition-all"
                    style={{
                      background: newItem.is_extreme_bonus ? '#ef4444' : '#2a2a2a',
                      border: `1px solid ${newItem.is_extreme_bonus ? '#ef4444' : '#3a3a3a'}`,
                      color: newItem.is_extreme_bonus ? '#fff' : '#8a8a8a',
                    }}
                  >
                    Extreme
                  </button>

                  <button
                    onClick={addBonusToHunt}
                    disabled={loading || !canAddNewBonus}
                    className="p-1.5 bg-green-600/90 hover:bg-green-500 border border-green-500/50 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: '#1f1f1f' }}>
              <div className="grid grid-cols-[60px_1fr_120px_140px_140px_50px] gap-3 px-4 py-3 border-b sticky top-0" style={{ background: '#1f1f1f', borderBottomColor: '#3a3a3a' }}>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: '#8a8a8a' }}>#</div>
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#8a8a8a' }}>SLOT</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: '#8a8a8a' }}>BET</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: '#8a8a8a' }}>EARNING</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: '#8a8a8a' }}>MULTI</div>
                <div></div>
              </div>

              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[60px_1fr_120px_140px_140px_50px] gap-3 px-4 py-2 border-b items-center transition-colors ${
                    item.payment_amount && item.payment_amount > 0 ? 'bg-[#2a2a2a]' : 'hover:bg-[#2a2a2a]'
                  }`}
                  style={{ borderBottomColor: '#333333' }}
                >
                  <div className="text-xs font-bold text-center" style={{ color: '#8a8a8a' }}>#{index + 1}</div>

                  <div className="flex items-center gap-3">
                    {item.slot_image_url && (
                      <img
                        src={item.slot_image_url}
                        alt={item.slot_name}
                        className="w-8 h-10 rounded object-contain"
                      />
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{item.slot_name}</span>
                      {item.is_super_bonus && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ background: 'rgba(184,153,104,0.2)', border: '1px solid #b89968', color: '#b89968' }}
                        >
                          Super
                        </span>
                      )}
                      {item.is_extreme_bonus && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid #ef4444', color: '#ef4444' }}
                        >
                          Extreme
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-white text-sm font-semibold">${item.bet_amount.toFixed(2)}</span>
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
                        className="w-20 px-2 py-1 text-white rounded text-sm text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{ background: '#2a2a2a', border: '1px solid #3a3a3a' }}
                      />
                    ) : (
                      <span className="text-white text-sm font-semibold">
                        {item.payment_amount ? `$${item.payment_amount.toFixed(2)}` : '-'}
                      </span>
                    )}
                  </div>

                  <div className="text-center">
                    <span className="text-white text-sm font-semibold">
                      {item.multiplier !== null && item.multiplier !== undefined ? `${item.multiplier.toFixed(2)}x` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    {selectedHunt.status === 'active' && (
                      <button
                        onClick={() => removeBonus(item.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10"
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
  );
}
