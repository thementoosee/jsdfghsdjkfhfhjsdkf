import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Swords, Star, Zap, DollarSign } from 'lucide-react';
import { GiveawayOverlay } from './GiveawayOverlay';
import { syncStreamElementsData } from '../lib/streamelements-service';
import {
  loadTwitchBadgeCatalog,
  normalizeBadgeList,
  resolveTwitchBadges,
  type ResolvedTwitchBadge,
  type TwitchBadgeRef,
} from '../lib/twitch-badges';
import {
  mergeRecentEvents,
  recentEventLabel,
  RECENT_EVENTS_LIMIT,
  type NormalizedRecentEvent,
} from '../lib/recent-events';
import { SLOT_FALLBACK_IMAGE } from '../lib/slot-image';
import {
  createEmptyTopSlotsPlaceholders,
  isTopSlotFilled,
  type TopSlotEntry,
} from '../lib/top-slots';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../lib/overlay-layout';

interface ChatMessage {
  id: string;
  username: string;
  display_name: string;
  message: string;
  color: string;
  badges?: TwitchBadgeRef[] | null;
  is_subscriber: boolean;
  is_moderator: boolean;
  created_at: string;
}

export function ChatOverlay() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [alerts, setAlerts] = useState<NormalizedRecentEvent[]>([]);
  const [giveawayWinner, setGiveawayWinner] = useState<string | null>(null);
  const [winnerSelectedAt, setWinnerSelectedAt] = useState<string | null>(null);

  // Visual scaffold only — ranking by historical max multiplier comes later.
  const [topSlots] = useState<TopSlotEntry[]>(() => createEmptyTopSlotsPlaceholders());
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [badgeCatalog, setBadgeCatalog] = useState<Record<string, { set_id: string; id: string; title: string; image_url_1x: string; image_url_2x: string; image_url_4x: string; source?: 'channel' | 'global' }> | null>(null);

  useEffect(() => {
    console.log('🚀 ChatOverlay: Initializing...');
    loadMessages();
    loadAlerts();
    loadActiveGiveawayWinner();
    void loadTwitchBadgeCatalog()
      .then((catalog) => setBadgeCatalog(catalog))
      .catch((error) => console.warn('[ChatOverlay] badge catalog load failed:', error));

    syncStreamElementsData().catch((error) => {
      console.error('Error syncing StreamElements data:', error);
    });

    const chatChannel = supabase
      .channel(`chat-messages-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_chat_messages' }, (payload) => {
        console.log('💬 [REALTIME] New chat message received:', payload);
        const newMessage = payload.new as ChatMessage;
        setMessages((prev) => [newMessage, ...prev].slice(0, 13));
      })
      .subscribe((status) => {
        console.log('📡 Chat channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Chat: Successfully subscribed to twitch_chat_messages!');
        }
      });

    const alertsChannel = supabase
      .channel(`chat-alerts-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'streamelements_events' }, (payload) => {
        console.log('🔔 New StreamElements event received:', payload);
        loadAlerts();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_alerts' }, (payload) => {
        console.log('🔔 New Twitch alert received:', payload);
        loadAlerts();
      })
      .subscribe((status) => {
        console.log('📡 Alerts channel status:', status);
      });

    const dataChannel = supabase
      .channel(`chat-data-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaways' }, () => {
        loadActiveGiveawayWinner();
      })
      .subscribe((status) => {
        console.log('📡 Data channel status:', status);
      });

    const interval = setInterval(() => {
      loadAlerts();
    }, 5000);

    const streamElementsSyncInterval = setInterval(() => {
      syncStreamElementsData().catch((error) => {
        console.error('Error syncing StreamElements data:', error);
      });
    }, 20000);

    return () => {
      console.log('🔌 ChatOverlay: Cleaning up subscriptions...');
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(dataChannel);
      clearInterval(interval);
      clearInterval(streamElementsSyncInterval);
    };
  }, []);

  useEffect(() => {
    if (topSlots.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlotIndex((prev) => (prev + 1) % topSlots.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [topSlots.length]);

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('twitch_chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(13);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

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

  const loadAlerts = async () => {
    try {
      const [{ data: twitchData, error: twitchError }, seResult] = await Promise.all([
        supabase
          .from('twitch_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('streamelements_events')
          .select('*')
          .eq('event_type', 'tip')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (twitchError) {
        console.error('[ChatOverlay] Twitch alerts load failed:', twitchError);
      }

      if (seResult.error) {
        console.warn('[ChatOverlay] StreamElements tips unavailable:', seResult.error.message);
      }

      setAlerts(
        mergeRecentEvents(
          (twitchData || []) as Record<string, unknown>[],
          (seResult.data || []) as Record<string, unknown>[],
          RECENT_EVENTS_LIMIT
        )
      );
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  return (
    <div
      className="h-[720px] relative"
      style={{ width: MAIN_OVERLAY_SIDEBAR_WIDTH_PX, marginTop: 0 }}
    >
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
                      <span className="inline-flex items-center align-middle max-w-full">
                        {resolveTwitchBadges(normalizeBadgeList(msg.badges), badgeCatalog).map((badge: ResolvedTwitchBadge) => (
                          <img
                            key={`${msg.id}-${badge.set_id}-${badge.id}`}
                            src={badge.image_url}
                            alt={badge.title}
                            title={badge.title}
                            className="inline-block mr-0.5 flex-shrink-0"
                            style={{
                              height: '18px',
                              width: 'auto',
                              verticalAlign: 'middle',
                            }}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ))}
                        <span
                          className="font-bold text-[11px]"
                          style={{ color: isWinner ? '#ffffff' : (msg.color || '#ffffff') }}
                        >
                          {msg.display_name}
                        </span>
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
                alerts.slice(0, RECENT_EVENTS_LIMIT).map((alert) => {
                  const getEventStyles = () => {
                    switch (alert.type) {
                      case 'follow':
                        return {
                          icon: UserPlus,
                          bgColor: 'rgba(52, 211, 153, 0.2)',
                          iconColor: '#34d399',
                        };
                      case 'raid':
                        return {
                          icon: Swords,
                          bgColor: 'rgba(249, 115, 22, 0.2)',
                          iconColor: '#f97316',
                        };
                      case 'subscription':
                      case 'resubscription':
                      case 'gift_subscription':
                        return {
                          icon: Star,
                          bgColor: 'rgba(168, 85, 247, 0.2)',
                          iconColor: '#a855f7',
                        };
                      case 'cheer':
                      case 'tip':
                        return {
                          icon: DollarSign,
                          bgColor: 'rgba(245, 158, 11, 0.2)',
                          iconColor: '#f59e0b',
                        };
                      default:
                        return {
                          icon: Zap,
                          bgColor: 'rgba(52, 211, 153, 0.2)',
                          iconColor: '#34d399',
                        };
                    }
                  };

                  const { icon: Icon, bgColor, iconColor } = getEventStyles();
                  const label = recentEventLabel(alert);

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
                {topSlots[currentSlotIndex] ? (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0 overflow-hidden">
                    <img
                      src={topSlots[currentSlotIndex].slot_image || SLOT_FALLBACK_IMAGE}
                      alt={
                        isTopSlotFilled(topSlots[currentSlotIndex])
                          ? String(topSlots[currentSlotIndex].slot_name)
                          : ''
                      }
                      className="min-w-full min-h-full object-cover rounded-lg"
                      style={{ objectPosition: 'center center' }}
                      onError={(e) => { e.currentTarget.src = SLOT_FALLBACK_IMAGE; }}
                    />
                  </div>
                ) : (
                  <div className="w-[72px] h-[104px] flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}>
                    <span className="text-4xl font-black" style={{ color: '#fbbf24' }}>?</span>
                  </div>
                )}

                {topSlots.length > 1 && (
                  <div className="flex flex-col justify-center gap-1.5">
                    {topSlots.map((slot) => (
                      <div
                        key={slot.rank}
                        className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: slot.rank - 1 === currentSlotIndex ? '#fbbf24' : 'rgba(255,255,255,0.3)'
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
                        {topSlots[currentSlotIndex]?.win_amount != null
                          ? `€${Number(topSlots[currentSlotIndex].win_amount).toFixed(0)}`
                          : '—'}
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
                        {topSlots[currentSlotIndex]?.max_multiplier != null
                          ? `${Number(topSlots[currentSlotIndex].max_multiplier).toFixed(1)}x`
                          : '—'}
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
                        {topSlots[currentSlotIndex]?.bet_amount != null
                          ? `€${Number(topSlots[currentSlotIndex].bet_amount).toFixed(2)}`
                          : '—'}
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
