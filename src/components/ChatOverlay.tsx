import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Swords, Star, Zap, DollarSign } from 'lucide-react';
import { GiveawayOverlay } from './GiveawayOverlay';

interface ChatMessage {
  id: string;
  username: string;
  display_name: string;
  message: string;
  color: string;
  is_subscriber: boolean;
  is_moderator: boolean;
  created_at: string;
}

interface CombinedEvent {
  id: string;
  event_id?: string | null;
  event_type: string;
  username: string;
  display_name: string;
  amount: number;
  months: number;
  created_at: string;
}

interface TopSlot {
  slot_name: string;
  slot_image: string | null;
  total_bonuses: number;
  total_bet: number;
  total_won: number;
  profit: number;
  average_multiplier: number;
}

export function ChatOverlay() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [alerts, setAlerts] = useState<CombinedEvent[]>([]);
  const [giveawayWinner, setGiveawayWinner] = useState<string | null>(null);
  const [winnerSelectedAt, setWinnerSelectedAt] = useState<string | null>(null);

  const [topSlots, setTopSlots] = useState<TopSlot[]>([]);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);

  useEffect(() => {
    console.log('🚀 ChatOverlay: Initializing...');
    loadTopSlots();
    loadActiveGiveawayWinner();
    setMessages([]);
    setAlerts([]);

    const dataChannel = supabase
      .channel(`chat-data-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunts' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunt_items' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_openings' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_opening_items' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_sessions' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_bonuses' }, () => {
        loadTopSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaways' }, () => {
        loadActiveGiveawayWinner();
      })
      .subscribe((status) => {
        console.log('📡 Data channel status:', status);
      });

    return () => {
      console.log('🔌 ChatOverlay: Cleaning up subscriptions...');
      supabase.removeChannel(dataChannel);
    };
  }, []);

  useEffect(() => {
    if (topSlots.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlotIndex((prev) => (prev + 1) % topSlots.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [topSlots.length]);

  const loadActiveGiveawayWinner = async () => {
    try {
      const { data, error } = await supabase
        .from('giveaways')
        .select('winner_username, completed_at')
        .eq('is_visible', true)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setGiveawayWinner(data?.winner_username || null);
      setWinnerSelectedAt(data?.completed_at || null);
    } catch (error) {
      console.error('Error loading giveaway winner:', error);
    }
  };

  const loadTopSlots = async () => {
    try {
      const { data: huntItems, error: huntError } = await supabase
        .from('bonus_hunt_items')
        .select('slot_name, slot_image_url, bet_amount, payment_amount, result_amount, status');

      if (huntError) throw huntError;

      const { data: openingItems, error: openingError } = await supabase
        .from('bonus_opening_items')
        .select('slot_name, slot_image, payment, payout, status');

      if (openingError) throw openingError;

      const { data: sessions, error: sessionsError } = await supabase
        .from('chill_sessions')
        .select('slot_name, total_bonuses, total_bet, total_won');

      if (sessionsError) throw sessionsError;

      const slotMap = new Map<string, { bet: number; won: number; count: number; image: string | null }>();

      huntItems?.forEach(item => {
        if (item.status === 'opened' && item.result_amount) {
          const existing = slotMap.get(item.slot_name) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(item.slot_name, {
            bet: existing.bet + (item.payment_amount || item.bet_amount),
            won: existing.won + item.result_amount,
            count: existing.count + 1,
            image: existing.image || item.slot_image_url
          });
        }
      });

      openingItems?.forEach(item => {
        if (item.status === 'opened' && item.payout) {
          const existing = slotMap.get(item.slot_name) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(item.slot_name, {
            bet: existing.bet + (item.payment || 0),
            won: existing.won + (item.payout || 0),
            count: existing.count + 1,
            image: existing.image || item.slot_image
          });
        }
      });

      sessions?.forEach((session: any) => {
        if (session.slot_name && session.total_bonuses > 0) {
          const slotName = session.slot_name;
          const existing = slotMap.get(slotName) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(slotName, {
            bet: existing.bet + (session.total_bet || 0),
            won: existing.won + (session.total_won || 0),
            count: existing.count + (session.total_bonuses || 0),
            image: existing.image
          });
        }
      });

      const slotNames = Array.from(slotMap.keys());
      const { data: slotsData } = await supabase
        .from('slots')
        .select('name, image_url')
        .in('name', slotNames);

      const slotImages = new Map(slotsData?.map(s => [s.name, s.image_url]) || []);

      const slots: TopSlot[] = Array.from(slotMap.entries()).map(([name, data]) => ({
        slot_name: name,
        slot_image: data.image || slotImages.get(name) || '/image.png',
        total_bonuses: data.count,
        total_bet: data.bet,
        total_won: data.won,
        profit: data.won - data.bet,
        average_multiplier: data.bet > 0 ? data.won / data.bet : 0
      }));

      slots.sort((a, b) => b.profit - a.profit);
      const top5 = slots.slice(0, 5);

      setTopSlots(top5);
    } catch (error) {
      console.error('Error loading top slots:', error);
    }
  };

  return (
    <div className="w-[288px] h-[720px] relative" style={{ marginTop: '0px', marginRight: '5px' }}>
      <div
        className="w-full h-full overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px'
        }}
      >
        <div
          className="relative w-full flex-shrink-0 px-4 py-3"
          style={{ background: 'rgba(0,0,0,0.2)' }}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="text-blue-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1
              className="text-sm font-black uppercase tracking-wide text-white"
              style={{
                textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(168,85,247,0.4)'
              }}
            >
              CHAT
            </h1>
          </div>

          <div
            className="w-full h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)'
            }}
          />
        </div>

        <div
          className="flex-1 overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))'
          }}
        >
          <div className="p-4 flex-shrink-0" style={{ height: '320px', overflow: 'hidden' }}>
            <div className="space-y-1.5">
              {messages.length > 0 ? (
                messages.slice(0, 11).map((msg) => {
                  const isWinner = giveawayWinner &&
                    msg.username.toLowerCase() === giveawayWinner.toLowerCase() &&
                    winnerSelectedAt &&
                    new Date(msg.created_at) > new Date(winnerSelectedAt);

                  return (
                    <div
                      key={msg.id}
                      className={`leading-tight ${isWinner ? 'rounded px-2 py-1.5' : ''}`}
                      style={isWinner ? {
                        background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
                        animation: 'pulse 2s infinite'
                      } : {}}
                    >
                      <span className="font-bold text-[11px]" style={{ color: isWinner ? '#ffffff' : (msg.color || '#ffffff') }}>
                        {msg.is_subscriber && 'S'}
                        {msg.is_moderator && 'M'}
                        {msg.display_name}
                      </span>
                      <span className="text-white/90 text-[11px] ml-1">{msg.message}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-white/50 text-[11px] text-center py-4">
                  Sem mensagens ainda...
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#34d399' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#34d399' }}
              >
                RECENT EVENTS
              </span>
            </div>

            <div className="space-y-2">
              {alerts.length > 0 ? (
                alerts.map((alert) => {
                  const getEventStyles = () => {
                    switch (alert.event_type) {
                      case 'follow':
                      case 'follower':
                        return {
                          icon: UserPlus,
                          bgColor: 'rgba(52, 211, 153, 0.2)',
                          iconColor: '#34d399',
                          label: 'New Follower'
                        };
                      case 'raid':
                        return {
                          icon: Swords,
                          bgColor: 'rgba(249, 115, 22, 0.2)',
                          iconColor: '#f97316',
                          label: `Raid (${alert.amount || ''})`
                        };
                      case 'subscriber':
                      case 'subscription':
                        return {
                          icon: Star,
                          bgColor: 'rgba(168, 85, 247, 0.2)',
                          iconColor: '#a855f7',
                          label: alert.months > 1 ? `Resub (${alert.months}mo)` : 'New Sub'
                        };
                      case 'cheer':
                        return {
                          icon: DollarSign,
                          bgColor: 'rgba(245, 158, 11, 0.2)',
                          iconColor: '#f59e0b',
                          label: `${alert.amount} Bits`
                        };
                      case 'tip':
                      case 'donation':
                        return {
                          icon: DollarSign,
                          bgColor: 'rgba(245, 158, 11, 0.2)',
                          iconColor: '#f59e0b',
                          label: `€${alert.amount?.toFixed(2)}`
                        };
                      case 'host':
                        return {
                          icon: Zap,
                          bgColor: 'rgba(96, 165, 250, 0.2)',
                          iconColor: '#60a5fa',
                          label: `Host`
                        };
                      default:
                        return {
                          icon: UserPlus,
                          bgColor: 'rgba(52, 211, 153, 0.2)',
                          iconColor: '#34d399',
                          label: alert.event_type
                        };
                    }
                  };

                  const { icon: Icon, bgColor, iconColor, label } = getEventStyles();

                  return (
                    <div key={alert.id} className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: bgColor }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
                      </div>
                      <div className="flex-1">
                        <div
                          className="text-[8px] font-bold uppercase tracking-wide"
                          style={{ color: 'rgba(255,255,255,0.6)' }}
                        >
                          {label}
                        </div>
                        <div className="text-sm font-black text-white">{alert.display_name}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-white/50 text-[11px] text-center py-4">
                  Sem alertas ainda...
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#fbbf24' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#fbbf24' }}
              >
                TOP 5 SLOTS
              </span>
            </div>

            {topSlots.length > 0 ? (
              <div className="flex gap-3">
                {topSlots[currentSlotIndex]?.slot_image ? (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0 overflow-hidden">
                    <img
                      src={topSlots[currentSlotIndex].slot_image}
                      alt={topSlots[currentSlotIndex].slot_name}
                      className="min-w-full min-h-full object-cover rounded-lg"
                      style={{ objectPosition: 'center center' }}
                    />
                  </div>
                ) : (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}>
                    <span className="text-4xl font-black" style={{ color: '#fbbf24' }}>?</span>
                  </div>
                )}

                {topSlots.length > 1 && (
                  <div className="flex flex-col justify-center gap-1.5">
                    {topSlots.map((_, index) => (
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
                        €{topSlots[currentSlotIndex]?.total_won?.toFixed(0) || '0'}
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
                        {(topSlots[currentSlotIndex]?.average_multiplier || 0).toFixed(1)}x
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
                        €{(topSlots[currentSlotIndex]?.total_bet / topSlots[currentSlotIndex]?.total_bonuses || 0).toFixed(2)}
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
            ) : (
              <div className="text-white/50 text-[11px] text-center py-4">
                Carregando estatísticas...
              </div>
            )}
          </div>
        </div>
      </div>
      <GiveawayOverlay />
    </div>
  );
}
