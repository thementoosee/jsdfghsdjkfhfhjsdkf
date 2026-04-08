import { useState, useEffect, useRef } from 'react';
import { Gift, TrendingUp, TrendingDown, DollarSign, Zap, Flame, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BonusOpeningOverlay } from './BonusOpeningOverlay';

interface BonusHunt {
  id: string;
  name: string;
  hunt_number: number;
  streamer_name?: string;
  status: 'active' | 'opening' | 'completed';
  total_invested: number;
  total_won: number;
  initial_break_even: number;
  current_break_even: number;
  profit_loss: number;
  bonus_count: number;
  opened_count: number;
}

interface BonusHuntItem {
  id: string;
  slot_name: string;
  slot_image_url?: string;
  bet_amount: number;
  payment_amount: number | null;
  result_amount: number | null;
  multiplier: number | null;
  status: 'pending' | 'opened';
  order_index: number;
  is_super_bonus: boolean | null;
  is_extreme_bonus?: boolean | null;
}

interface BonusHuntOverlayProps {
  huntId?: string;
  embedded?: boolean;
}

export function BonusHuntOverlay({ huntId, embedded = false }: BonusHuntOverlayProps = {}) {
  const [hunt, setHunt] = useState<BonusHunt | null>(null);
  const [items, setItems] = useState<BonusHuntItem[]>([]);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());
  const previousItemIdsRef = useRef<Set<string>>(new Set());
  const currentHuntIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadActiveHunt();

    const huntChannel = supabase
      .channel('bonus_hunt_overlay_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunts' },
        (payload) => {
          console.log('[BonusHuntOverlay] Hunt change:', payload);

          if (payload.eventType === 'UPDATE' && currentHuntIdRef.current) {
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;

            if (newRecord.id === currentHuntIdRef.current &&
                newRecord.show_on_main_overlay !== oldRecord.show_on_main_overlay) {
              console.log('[BonusHuntOverlay] show_on_main_overlay changed, reloading');
              loadActiveHunt();
              return;
            }
          }

          loadActiveHunt();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunt_items' },
        (payload) => {
          console.log('[BonusHuntOverlay] Item change:', payload);
          if (currentHuntIdRef.current) {
            loadHuntItems(currentHuntIdRef.current);
          }
        }
      )
      .subscribe((status) => {
        console.log('[BonusHuntOverlay] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(huntChannel);
    };
  }, [huntId]);

  const loadActiveHunt = async () => {
    try {
      let query = supabase
        .from('bonus_hunts')
        .select('*');

      if (huntId) {
        query = query.eq('id', huntId);
      } else {
        query = query
          .eq('show_on_main_overlay', true)
          .in('status', ['active', 'opening'])
          .order('created_at', { ascending: false })
          .limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      console.log('[BonusHuntOverlay] Hunt loaded:', data);

      if (data) {
        if (huntId && !data.show_on_main_overlay) {
          console.log('[BonusHuntOverlay] Hunt is not active on main overlay, clearing...');
          currentHuntIdRef.current = null;
          setHunt(null);
          setItems([]);
          previousItemIdsRef.current = new Set();
          return;
        }

        currentHuntIdRef.current = data.id;
        setHunt(data);
        loadHuntItems(data.id);
      } else {
        currentHuntIdRef.current = null;
        setHunt(null);
        setItems([]);
        previousItemIdsRef.current = new Set();
      }
    } catch (error) {
      console.error('Error loading hunt:', error);
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

      const newData = data || [];
      const newIds = new Set<string>();
      const removedIds = new Set<string>();
      const currentIds = new Set(newData.map(item => item.id));

      newData.forEach(item => {
        if (!previousItemIdsRef.current.has(item.id) && item.status === 'pending') {
          newIds.add(item.id);
        }
      });

      previousItemIdsRef.current.forEach(id => {
        if (!currentIds.has(id)) {
          removedIds.add(id);
        }
      });

      if (newIds.size > 0) {
        setNewItemIds(newIds);
        setTimeout(() => {
          setNewItemIds(new Set());
        }, 800);
      }

      if (removedIds.size > 0) {
        setRemovedItemIds(removedIds);
        setTimeout(() => {
          setRemovedItemIds(new Set());
          previousItemIdsRef.current = new Set(newData.map(item => item.id));
          setItems(newData);
        }, 500);
      } else {
        previousItemIdsRef.current = new Set(newData.map(item => item.id));
        setItems(newData);
      }
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const hasHunt = !!hunt;
  const isOpeningMode = hunt?.status === 'opening';

  if (isOpeningMode && hunt) {
    return <BonusOpeningOverlay huntId={hunt.id} embedded={embedded} />;
  }

  const pendingItems = items.filter(item => item.status === 'pending');
  const openedItems = items.filter(item => item.status === 'opened');
  const superBonusCount = items.filter(item => item.is_super_bonus === true).length;
  const extremeBonusCount = items.filter(item => item.is_extreme_bonus === true).length;
  const carouselItems = items;
  const huntCarouselLoopItems = carouselItems.length > 1 ? [...carouselItems, ...carouselItems] : carouselItems;
  const huntCarouselDuration = Math.max(16, carouselItems.length * 4);
  const scrollingItems = items.length > 4 ? [...items, ...items] : items;

  const currentBreakEven = (() => {
    if (!hunt) return '0x';
    const breakEven = hunt.opened_count > 0 ? hunt.current_break_even : hunt.initial_break_even;
    return `${breakEven.toFixed(0)}x`;
  })();

  const currentMultiplier = (() => {
    if (!hunt || hunt.total_invested === 0) return '0x';
    const multiplier = hunt.total_won / hunt.total_invested;
    return `${multiplier.toFixed(2)}x`;
  })();

  return (
    <div className="w-[288px] h-[720px] relative" style={{ marginTop: '0px', marginLeft: '62px' }}>
      <style>{`
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideOutToRight {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }
        @keyframes huntCarouselSlide {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        @keyframes huntCardFloat3d {
          0%, 100% {
            transform: translateY(0) rotateY(-7deg) rotateX(2deg) scale(0.985);
          }
          50% {
            transform: translateY(-4px) rotateY(7deg) rotateX(-1deg) scale(1.015);
          }
        }
      `}</style>

      {hasHunt && !isOpeningMode && (
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
                    BONUS HUNT
                  </h1>
                  <span className="text-[9px] font-semibold text-white/80 leading-none">{hunt?.streamer_name || 'fever'}</span>
                </div>
              </div>
              <div className="text-[11px] font-black text-white/70">
                #{hunt?.hunt_number || '1'}
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
                    <DollarSign className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">START</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">${hunt?.total_invested.toFixed(2)}</span>
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
                <div className="flex flex-col items-center justify-center relative z-10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">BREAKEVEN</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{currentBreakEven}</span>
                </div>
              </div>
            </div>

            <div className="w-full mb-2">
              <div
                className="rounded-lg px-2 py-1 relative overflow-hidden mb-2"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}
              >
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.25) 25%, transparent 100%)'
                }}></div>
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-1">
                    <Gift className="w-2.5 h-2.5 text-purple-300" />
                    <span className="text-[7px] font-semibold text-purple-200 uppercase leading-none tracking-wide">BONUSES</span>
                  </div>
                  <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{hunt?.bonus_count}</span>
                </div>
              </div>

              <div className="w-full grid grid-cols-2 gap-1.5">
                <div
                  className="rounded-lg px-2 py-1 relative overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse at center, rgba(234, 179, 8, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)',
                    border: '1px solid rgba(234, 179, 8, 0.5)'
                  }}
                >
                  <div className="absolute inset-0" style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(234, 179, 8, 0.3) 25%, transparent 100%)'
                  }}></div>
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-yellow-300" />
                      <span className="text-[7px] font-semibold text-yellow-200 uppercase leading-none tracking-wide">SUPER</span>
                    </div>
                    <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{superBonusCount}</span>
                  </div>
                </div>

                <div
                  className="rounded-lg px-2 py-1 relative overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)',
                    border: '1px solid rgba(239, 68, 68, 0.5)'
                  }}
                >
                  <div className="absolute inset-0" style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.3) 25%, transparent 100%)'
                  }}></div>
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-1">
                      <Flame className="w-2.5 h-2.5 text-red-300" />
                      <span className="text-[7px] font-semibold text-red-200 uppercase leading-none tracking-wide">EXTREME</span>
                    </div>
                    <span className="text-[13px] font-black text-white leading-none drop-shadow-lg">{extremeBonusCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden flex flex-col"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))' }}
          >
            <div className="px-3 pt-3 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: '#38bdf8' }}></div>
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#38bdf8' }}>
                  LIVE CAROUSEL
                </span>
              </div>

              <div className="relative h-[118px] rounded-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.55), rgba(2,6,23,0.85))', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                {carouselItems.length > 0 ? (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      perspective: '1000px',
                      maskImage: 'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)'
                    }}
                  >
                    <div
                      className="flex h-full items-stretch gap-2 px-2"
                      style={{
                        width: 'max-content',
                        animation: carouselItems.length > 1
                          ? `huntCarouselSlide ${huntCarouselDuration}s linear infinite`
                          : 'none'
                      }}
                    >
                      {huntCarouselLoopItems.map((item, index) => {
                        const actualIndex = carouselItems.length > 0 ? (index % carouselItems.length) : 0;
                        const payment = item.payment_amount || item.bet_amount;
                        const isOpened = item.status === 'opened';
                        const isWin = isOpened && (item.result_amount || 0) > payment;

                        return (
                          <div
                            key={`hunt-carousel-${item.id}-${index}`}
                            className="w-[120px] h-full flex-shrink-0 rounded-lg overflow-hidden relative"
                            style={{
                              border: item.is_super_bonus === true
                                ? '2px solid rgba(255, 215, 0, 0.95)'
                                : item.is_extreme_bonus === true
                                ? '2px solid rgba(239, 68, 68, 0.95)'
                                : '1px solid rgba(255,255,255,0.3)',
                              boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
                              background: 'rgba(0,0,0,0.25)',
                              transformStyle: 'preserve-3d',
                              animation: `huntCardFloat3d 4.2s ease-in-out ${actualIndex * 0.18}s infinite`
                            }}
                          >
                            {item.slot_image_url && (
                              <div
                                className="absolute inset-0 opacity-20"
                                style={{
                                  backgroundImage: `url("${item.slot_image_url}"), url("/image.png")`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  filter: 'blur(8px)',
                                  transform: 'scale(1.08)'
                                }}
                              />
                            )}

                            <div className="relative z-10 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1">
                              <span className="text-[8px] font-black text-white truncate uppercase">{item.slot_name}</span>
                              <span className="text-[8px] font-bold text-sky-300">€{payment.toFixed(2)}</span>
                            </div>

                            <div className="relative z-10 h-[70px] overflow-hidden">
                              <img
                                src={item.slot_image_url || '/image.png'}
                                alt={item.slot_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = '/image.png';
                                }}
                              />
                              {item.is_extreme_bonus === true && (
                                <span className="absolute bottom-1 left-1 rounded bg-red-500 px-1 py-0.5 text-[7px] font-black uppercase text-white">EXTREME</span>
                              )}
                              {item.is_super_bonus === true && (
                                <span className="absolute bottom-1 left-1 rounded bg-yellow-500 px-1 py-0.5 text-[7px] font-black uppercase text-white">SUPER</span>
                              )}
                            </div>

                            <div className="relative z-10 flex items-center justify-between bg-black/55 px-1.5 py-1">
                              <span className="text-[8px] font-bold" style={{ color: isOpened ? (isWin ? '#4ade80' : '#f87171') : '#fbbf24' }}>
                                {isOpened ? `€${(item.result_amount || 0).toFixed(0)}` : 'PENDING'}
                              </span>
                              <span className="rounded bg-black/40 px-1 py-0.5 text-[8px] font-black text-amber-300">
                                {isOpened ? `${(item.multiplier || 0).toFixed(1)}x` : `#${actualIndex + 1}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-white/60">
                    No bonuses yet
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2 px-4 pt-1 flex-shrink-0">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: '#fbbf24' }}></div>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#fbbf24' }}>
                BONUS LIST
              </span>
            </div>

            <div className="flex-1 overflow-hidden px-4 pb-4">
              <div
                className="space-y-2"
                style={{
                  animation: items.length > 4 ? 'scroll 28s linear infinite' : 'none'
                }}
              >
                {scrollingItems.map((item, index) => {
                  const actualIndex = items.length > 0 ? (index % items.length) : 0;
                  const cardIsTall = actualIndex % 2 === 1;
                  const payment = item.payment_amount || item.bet_amount;
                  const isOpened = item.status === 'opened';
                  const isWin = isOpened && (item.result_amount || 0) > payment;
                  const isFirstOccurrence = index < items.length;
                  const isNewItem = newItemIds.has(item.id) && isFirstOccurrence;
                  const isRemovedItem = removedItemIds.has(item.id);

                  return (
                    <div
                      key={`${item.id}-${index}`}
                      className="rounded-xl overflow-hidden relative"
                      style={{
                        minHeight: cardIsTall ? '88px' : '66px',
                        background: isOpened
                          ? (isWin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                          : 'rgba(251, 191, 36, 0.15)',
                        border: item.is_super_bonus === true
                          ? '2px solid rgba(255, 215, 0, 0.95)'
                          : item.is_extreme_bonus === true
                          ? '2px solid rgba(239, 68, 68, 0.95)'
                          : isOpened
                          ? `1px solid ${isWin ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
                          : '1px solid rgba(251, 191, 36, 0.35)',
                        animation: isNewItem
                          ? 'slideInFromLeft 0.6s ease-out'
                          : isRemovedItem
                          ? 'slideOutToRight 0.5s ease-in forwards'
                          : 'none'
                      }}
                    >
                      {item.slot_image_url && (
                        <div
                          className="absolute inset-0 opacity-20"
                          style={{
                            backgroundImage: `url("${item.slot_image_url}"), url("/image.png")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(10px)',
                            transform: 'scale(1.08)'
                          }}
                        />
                      )}

                      <div className="flex items-center relative z-10 h-full">
                        <div className={`${cardIsTall ? 'w-14' : 'w-12'} h-full flex-shrink-0 overflow-hidden`}>
                          <img
                            src={item.slot_image_url || '/image.png'}
                            alt={item.slot_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/image.png';
                            }}
                          />
                        </div>

                        <div className="flex-1 min-w-0 px-2.5 py-2">
                          <div className="text-white text-xs font-black truncate mb-1">{item.slot_name}</div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' }}>
                              €{payment.toFixed(2)}
                            </span>
                            {isOpened && (
                              <>
                                <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: isWin ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: isWin ? '#10b981' : '#ef4444' }}>
                                  €{item.result_amount?.toFixed(0) || '0'}
                                </span>
                                <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}>
                                  {item.multiplier?.toFixed(1) || '0.0'}x
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="pr-2 text-[10px] font-black" style={{ color: 'rgba(251, 191, 36, 0.55)' }}>
                          #{actualIndex + 1}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
