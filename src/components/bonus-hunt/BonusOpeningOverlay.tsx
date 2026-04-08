import { useState, useEffect, useRef } from 'react';
import { Gift, TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Zap, Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BonusOpening {
  id: string;
  name: string;
  opening_number?: number;
  hunt_number?: number;
  status: 'active' | 'completed' | 'opening';
  total_investment?: number;
  total_invested?: number;
  initial_investment?: number;
  total_payout: number;
  initial_break_even: number;
  current_break_even: number;
  profit_loss: number;
  current_multiplier: number;
  streamer_name: string;
  brand_logo_id: string | null;
  show_on_main_overlay?: boolean;
  isHunt?: boolean;
}

interface BonusOpeningItem {
  id: string;
  bonus_opening_id: string;
  slot_name: string;
  slot_image: string;
  payment: number;
  payout: number;
  multiplier: number;
  status: 'pending' | 'opened';
  order_index: number;
  super_bonus: boolean | null;
}

interface BonusOpeningOverlayProps {
  openingId?: string;
  huntId?: string;
  embedded?: boolean;
}

export function BonusOpeningOverlay({ openingId, huntId, embedded = false }: BonusOpeningOverlayProps = {}) {
  const [opening, setOpening] = useState<BonusOpening | null>(null);
  const [items, setItems] = useState<BonusOpeningItem[]>([]);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [showInitialBE, setShowInitialBE] = useState(true);

  useEffect(() => {
    console.log('[BonusOpeningOverlay] useEffect triggered with openingId:', openingId);
    loadActiveOpening();

    const openingChannel = supabase
      .channel('bonus_opening_overlay')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_openings' },
        async (payload) => {
          console.log('[BonusOpeningOverlay] Realtime event received:', payload);
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newData = payload.new as any;
            if (newData.show_on_main_overlay) {
              setOpening({ ...newData });
              if (newData.id) {
                await loadOpeningItems(newData.id);
              }
            } else {
              setOpening(prev => {
                if (prev && prev.id === newData.id) {
                  return { ...prev, ...newData };
                }
                return prev;
              });
            }
          }
          await loadActiveOpening();
        }
      )
      .subscribe();

    const huntChannel = supabase
      .channel('bonus_hunt_opening_overlay')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunts' },
        async (payload) => {
          console.log('[BonusOpeningOverlay] Hunt event received:', payload);
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newData = payload.new as any;
            if (newData.status === 'opening' || newData.show_on_main_overlay) {
              setOpening({ ...newData, isHunt: true });
              if (newData.id) {
                await loadHuntItems(newData.id);
              }
            }
          }
          await loadActiveOpening();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(openingChannel);
      supabase.removeChannel(huntChannel);
    };
  }, [openingId, huntId]);

  useEffect(() => {
    if (!opening) return;

    if (opening.isHunt) {
      const huntItemsChannel = supabase
        .channel('bonus_hunt_items_overlay')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bonus_hunt_items' },
          (payload) => {
            console.log('[BonusOpeningOverlay] Hunt item changed:', payload);
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedItem = payload.new as any;
              setItems(prev => prev.map(item =>
                item.id === updatedItem.id
                  ? {
                      id: updatedItem.id,
                      bonus_opening_id: opening.id,
                      slot_name: updatedItem.slot_name,
                      slot_image: updatedItem.slot_image_url || '',
                      payment: updatedItem.payment_amount || updatedItem.bet_amount || 0,
                      payout: updatedItem.result_amount || 0,
                      multiplier: updatedItem.multiplier || 0,
                      status: updatedItem.status,
                      order_index: updatedItem.order_index,
                      super_bonus: updatedItem.is_super_bonus ?? null
                    }
                  : item
              ));
            }
            loadHuntItems(opening.id);
            loadActiveOpening();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(huntItemsChannel);
      };
    } else {
      const itemsChannel = supabase
        .channel('bonus_opening_items_overlay')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bonus_opening_items' },
          async (payload) => {
            console.log('[BonusOpeningOverlay] Opening item changed:', payload);
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedItem = payload.new as BonusOpeningItem;
              setItems(prev => prev.map(item =>
                item.id === updatedItem.id ? updatedItem : item
              ));

              const { data } = await supabase
                .from('bonus_openings')
                .select('*')
                .eq('id', opening.id)
                .maybeSingle();

              if (data) {
                setOpening(prev => prev ? { ...prev, ...data } : data);
              }
            }
            loadOpeningItems(opening.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(itemsChannel);
      };
    }
  }, [opening?.id, opening?.isHunt]);

  useEffect(() => {
    const openedItemsList = items.filter(item => item.status === 'opened');
    const sortedSlots = [...openedItemsList].sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0));
    const bestSlot = sortedSlots[0] || null;
    const worstSlot = sortedSlots[sortedSlots.length - 1] || null;
    const slotsToShow = [bestSlot, worstSlot].filter((slot, index, arr) => slot && arr.indexOf(slot) === index);

    if (slotsToShow.length > 1) {
      const interval = setInterval(() => {
        setCurrentSlotIndex((prev) => (prev + 1) % slotsToShow.length);
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowInitialBE(prev => !prev);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadActiveOpening = async () => {
    try {
      console.log('[BonusOpeningOverlay] Loading active opening...', { openingId, huntId });

      if (huntId) {
        console.log('[BonusOpeningOverlay] Loading hunt by ID:', huntId);
        const { data, error } = await supabase
          .from('bonus_hunts')
          .select('*')
          .eq('id', huntId)
          .maybeSingle();

        if (error) {
          console.error('[BonusOpeningOverlay] Error loading hunt by ID:', error);
          throw error;
        }

        if (data) {
          console.log('[BonusOpeningOverlay] Hunt loaded by ID:', data);
          setOpening({ ...data, isHunt: true } as any);
          await loadHuntItems(data.id);
        } else {
          console.warn('[BonusOpeningOverlay] No hunt found with ID:', huntId);
          setOpening(null);
          setItems([]);
        }
        return;
      }

      if (openingId) {
        const { data, error } = await supabase
          .from('bonus_openings')
          .select('*')
          .eq('id', openingId)
          .maybeSingle();

        if (error) {
          console.error('[BonusOpeningOverlay] Error loading opening by ID:', error);
          throw error;
        }

        console.log('[BonusOpeningOverlay] Opening loaded by ID:', data);

        if (data) {
          setOpening(data);
          await loadOpeningItems(data.id);
        } else {
          console.warn('[BonusOpeningOverlay] No opening found with ID:', openingId);
          setOpening(null);
          setItems([]);
        }
        return;
      }

      const { data: huntData } = await supabase
        .from('bonus_hunts')
        .select('*')
        .eq('status', 'opening')
        .eq('show_on_main_overlay', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (huntData) {
        console.log('[BonusOpeningOverlay] Hunt in opening mode found:', huntData);
        setOpening({ ...huntData, isHunt: true } as any);
        await loadHuntItems(huntData.id);
        return;
      }

      const { data, error } = await supabase
        .from('bonus_openings')
        .select('*')
        .eq('show_on_main_overlay', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      console.log('[BonusOpeningOverlay] Active opening loaded:', data);

      if (data) {
        setOpening(data);
        await loadOpeningItems(data.id);
      } else {
        console.log('[BonusOpeningOverlay] No active opening found');
        setOpening(null);
        setItems([]);
      }
    } catch (error) {
      console.error('Error loading opening:', error);
    }
  };

  const loadHuntItems = async (huntId: string) => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunt_items')
        .select('*')
        .eq('hunt_id', huntId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      if (data) {
        const mappedData = data.map(item => ({
          id: item.id,
          bonus_opening_id: huntId,
          slot_name: item.slot_name,
          slot_image: item.slot_image_url || '',
          payment: item.payment_amount || item.bet_amount || 0,
          payout: item.result_amount || 0,
          multiplier: item.multiplier || 0,
          status: item.status,
          order_index: item.order_index,
          super_bonus: item.is_super_bonus ?? null
        }));

        setItems(mappedData);
      }
    } catch (error) {
      console.error('Error loading hunt items:', error);
    }
  };

  const loadOpeningItems = async (openingId: string) => {
    try {
      console.log('[BonusOpeningOverlay] Loading opening items for:', openingId);
      const { data, error } = await supabase
        .from('bonus_opening_items')
        .select('*')
        .eq('bonus_opening_id', openingId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      if (data) {
        console.log('[BonusOpeningOverlay] Loaded items:', data.length, data);
        setItems(data);
      }
    } catch (error) {
      console.error('[BonusOpeningOverlay] Error loading items:', error);
    }
  };

  const hasOpening = !!opening;

  console.log('[BonusOpeningOverlay] Render - hasOpening:', hasOpening, 'opening:', opening, 'items:', items.length);

  const superBonusCount = items.filter(item => item.super_bonus === true).length;
  const extremeBonusCount = items.filter(item => item.super_bonus === false).length;

  const pendingItems = items.filter(item => item.status === 'pending');
  const openedItems = items.filter(item => item.status === 'opened');

  const totalPay = items.reduce((sum, item) => sum + (item.payout || 0), 0);
  const startAmount = opening?.initial_investment || opening?.total_investment || opening?.total_invested || 0;
  const profit = totalPay + startAmount;
  const isProfitable = profit >= 0;

  const average = (() => {
    const openedItemsList = items.filter(item => item.status === 'opened');
    if (openedItemsList.length === 0) return '0.00x';
    const totalMultiplier = openedItemsList.reduce((sum, item) => {
      return sum + item.multiplier;
    }, 0);
    return `${(totalMultiplier / openedItemsList.length).toFixed(2)}x`;
  })();

  const currentBreakEven = (() => {
    if (!opening) return '0x';
    const totalWon = openedItems.reduce((sum, item) => sum + (item.payout || 0), 0);
    const remainingPayment = pendingItems.reduce((sum, item) => sum + (item.payment || 0), 0);
    if (remainingPayment <= 0) return '0x';
    return `${Math.max(0, (startAmount - totalWon) / remainingPayment).toFixed(0)}x`;
  })();

  const sortedSlots = [...openedItems].sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0));
  const bestSlot = sortedSlots[0] || null;
  const worstSlot = sortedSlots[sortedSlots.length - 1] || null;
  const slotsToShow = [bestSlot, worstSlot].filter((slot, index, arr) => slot && arr.indexOf(slot) === index);
  const currentSlot = slotsToShow[currentSlotIndex] || null;

  return (
    <div className="w-[288px] h-[720px] relative" style={{ marginTop: '0px', marginLeft: '62px' }}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-30px, 30px) scale(0.9); }
        }
        @keyframes slideInFromLeft {
          0% {
            opacity: 0;
            transform: translateX(-100%);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes scroll {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-50%);
          }
        }
        @keyframes slideInFromRight {
          0% {
            opacity: 0;
            transform: translateX(100%);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideOut {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(100%);
          }
        }
        @keyframes slideIn {
          0% {
            opacity: 0;
            transform: translateX(100%);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      {hasOpening && (
        <div
          className="w-full h-full overflow-hidden flex flex-col relative"
          style={{
            background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px'
          }}
        >
          <div
            className="relative w-full flex-shrink-0 px-3 py-2.5"
            style={{ background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-blue-400" />
                <div className="flex flex-col">
                  <h1 className="text-[10px] font-black uppercase tracking-wide text-white leading-none">
                    BONUS {opening?.isHunt && opening?.status !== 'opening' ? 'HUNT' : 'OPENING'}
                  </h1>
                  <span className="text-[9px] font-semibold text-white/80 leading-none">{opening?.streamer_name || 'fever'}</span>
                </div>
              </div>
              <div className="text-[11px] font-black text-white/70">
                #{opening?.isHunt ? opening?.hunt_number || '1' : opening?.opening_number || '1'}
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-1.5 mb-2">
              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.25) 25%, transparent 100%)'
                }}></div>
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">AVERAGE</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{average}</span>
                </div>
              </div>

              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.25) 25%, transparent 100%)'
                }}></div>
                <div
                  className="flex flex-col items-center justify-center transition-opacity duration-500 relative z-10"
                  style={{ opacity: showInitialBE ? 1 : 0 }}
                >
                  {showInitialBE && (
                    <>
                      <div className="flex items-center gap-1 mb-0.5">
                        <Target className="w-2.5 h-2.5 text-purple-300" />
                        <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">BE INICIAL</span>
                      </div>
                      <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{opening.initial_break_even.toFixed(2)}x</span>
                    </>
                  )}
                </div>
                <div
                  className="flex flex-col items-center justify-center transition-opacity duration-500 absolute top-1.5 left-2 right-2 z-10"
                  style={{ opacity: !showInitialBE ? 1 : 0 }}
                >
                  {!showInitialBE && (
                    <>
                      <div className="flex items-center gap-1 mb-0.5">
                        <TrendingUp className="w-2.5 h-2.5 text-purple-300" />
                        <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">BE ATUAL</span>
                      </div>
                      <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{currentBreakEven}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full mb-2">
              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.25) 25%, transparent 100%)'
                }}></div>
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <DollarSign className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">TOTAL PAY</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{totalPay.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="w-full grid grid-cols-3 gap-1.5 mb-2">
              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.25) 25%, transparent 100%)'
                }}></div>
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Gift className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">BONUSES</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{items.length}</span>
                </div>
              </div>

              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(234, 179, 8, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(234, 179, 8, 0.5)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(234, 179, 8, 0.3) 25%, transparent 100%)'
                }}></div>
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Zap className="w-2.5 h-2.5 text-yellow-300" />
                    <span className="text-[7px] font-semibold text-yellow-200 uppercase leading-none tracking-wide">SUPER</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{superBonusCount}</span>
                </div>
              </div>

              <div
                className="rounded-lg px-2 py-1.5 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.5)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.3) 25%, transparent 100%)'
                }}></div>
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Flame className="w-2.5 h-2.5 text-red-300" />
                    <span className="text-[7px] font-semibold text-red-200 uppercase leading-none tracking-wide">EXTREME</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{extremeBonusCount}</span>
                </div>
              </div>
            </div>

            <div className="px-0 pb-2">
              <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${items.length > 0 ? (openedItems.length / items.length) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[8px] font-bold text-white/60">{openedItems.length}/{items.length}</span>
                <span className="text-[8px] font-bold text-white/60">{items.length > 0 ? Math.round((openedItems.length / items.length) * 100) : 0}%</span>
              </div>
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden flex flex-col"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))' }}
          >
            <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-3 px-4 pt-4">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#fbbf24' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#fbbf24' }}
              >
                BONUS
              </span>
            </div>

            <div className="space-y-2 flex-1 overflow-hidden px-4 pb-4">
              <div
                className="space-y-2"
                style={{
                  animation: items.length > 5 ? 'scroll 30s linear infinite' : 'none'
                }}
              >
              {(items.length > 5 ? [...items, ...items] : items).map((item, index) => {
                const actualIndex = index % items.length;
                const isLastBeforeRepeat = items.length > 5 && (index + 1) % items.length === 0;
                const payment = item.payment;
                const isOpened = item.status === 'opened';
                const isWin = isOpened && item.payout && item.payout > payment;
                const profit = isOpened && item.payout ? item.payout - payment : 0;
                return (
                <>
                <div
                  key={`${item.id}-${index}`}
                  className="rounded-xl overflow-hidden relative"
                  style={{
                    background: isOpened
                      ? (isWin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                      : 'rgba(251, 191, 36, 0.15)',
                    border: item.super_bonus === true
                      ? '3px solid rgba(255, 215, 0, 0.95)'
                      : item.super_bonus === false
                      ? '3px solid rgba(239, 68, 68, 0.95)'
                      : isOpened
                      ? `1px solid ${isWin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      : '1px solid rgba(251, 191, 36, 0.3)',
                    animation: 'none',
                    transition: 'none'
                  }}
                >
                  {item.slot_image && (
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundImage: `url("${item.slot_image}"), url("/image.png")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(8px)',
                        transform: 'scale(1.1)'
                      }}
                    />
                  )}
                  <div className="flex items-center relative z-10">
                    {item.slot_image ? (
                      <div className="w-12 h-full flex items-center justify-center flex-shrink-0 rounded-l-xl overflow-hidden">
                        <img
                          src={item.slot_image}
                          alt={item.slot_name}
                          className="w-full h-full object-contain"
                          style={{
                            borderTopRightRadius: '0.75rem',
                            borderBottomRightRadius: '0.75rem'
                          }}
                          onError={(e) => {
                            e.currentTarget.src = '/image.png';
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-full flex-shrink-0 flex items-center justify-center text-base font-black rounded-l-xl"
                        style={{
                          background: isOpened
                            ? (isWin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)')
                            : 'rgba(251, 191, 36, 0.3)',
                          color: isOpened
                            ? (isWin ? '#10b981' : '#ef4444')
                            : '#fbbf24',
                          borderTopRightRadius: '0.75rem',
                          borderBottomRightRadius: '0.75rem'
                        }}
                      >
                        ?
                      </div>
                    )}
                    <div className="flex-1 min-w-0 p-3 pr-2">
                      <div className="text-white text-xs font-bold truncate mb-1">
                        {item.slot_name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        {isOpened ? (
                          <>
                            <span
                              className="font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: 'rgba(251, 191, 36, 0.2)',
                                color: '#fbbf24'
                              }}
                            >
                              €{payment.toFixed(2)}
                            </span>
                            <span
                              className="font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: isWin ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: isWin ? '#10b981' : '#ef4444'
                              }}
                            >
                              €{item.payout?.toFixed(0) || '0'}
                            </span>
                            <span
                              className="font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: 'rgba(168, 85, 247, 0.2)',
                                color: '#a855f7'
                              }}
                            >
                              {item.multiplier?.toFixed(0) || '0'}x
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold" style={{ color: '#fbbf24' }}>
                            €{payment.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="absolute right-1.5" style={{ top: '-0.4rem' }}>
                      <span className="text-[10px] font-black text-right" style={{ color: 'rgba(251, 191, 36, 0.4)', minWidth: '20px' }}>
                        #{actualIndex + 1}
                      </span>
                    </div>
                  </div>
                </div>
                {isLastBeforeRepeat && (
                  <div key={`spacer-${index}`} style={{ height: '8px' }} />
                )}
                </>
                );
              })}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#fbbf24' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#fbbf24' }}
              >
                {slotsToShow.length === 1 ? 'BEST SLOT' : 'BEST AND WORST'}
              </span>
            </div>

            <div className="flex gap-3">
                {currentSlot?.slot_image ? (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0 overflow-hidden">
                    <img
                      src={currentSlot.slot_image}
                      alt={currentSlot.slot_name}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}>
                    <span className="text-4xl font-black" style={{ color: '#fbbf24' }}>?</span>
                  </div>
                )}

                {slotsToShow.length > 1 && (
                  <div className="flex flex-col justify-center gap-1.5">
                    {slotsToShow.map((_, index) => (
                      <div
                        key={index}
                        className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: index === currentSlotIndex ? '#fbbf24' : 'rgba(255,255,255,0.3)'
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-between py-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}>
                      <span className="text-xs">🏆</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-sm font-black" style={{ color: '#fbbf24' }}>
                        €{currentSlot?.payout?.toFixed(0) || '0'}
                      </div>
                      <div
                        className="text-[8px] font-bold uppercase tracking-wide leading-none"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                      >
                        BEST WIN
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
                      <span className="text-xs">⚡</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-sm font-black" style={{ color: '#a855f7' }}>
                        {(currentSlot?.multiplier || 0).toFixed(1)}x
                      </div>
                      <div
                        className="text-[8px] font-bold uppercase tracking-wide leading-none"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                      >
                        BEST MULTI
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
                      <span className="text-xs">💰</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-sm font-black" style={{ color: '#22c55e' }}>
                        €{currentSlot?.payment?.toFixed(2) || '0.00'}
                      </div>
                      <div
                        className="text-[8px] font-bold uppercase tracking-wide leading-none"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                      >
                        BET SIZE
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
