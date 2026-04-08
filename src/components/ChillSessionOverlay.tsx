import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, Zap, Target, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChillSession {
  id: string;
  slot_name: string;
  streamer_name: string | null;
  brand_logo_id: string | null;
  started_at: string;
  ended_at: string | null;
  total_bonuses: number;
  total_bet: number;
  total_won: number;
  max_win: number;
  max_multiplier: number;
}

interface BrandLogo {
  id: string;
  name: string;
  logo_url: string;
}

interface SlotInfo {
  id: string;
  name: string;
  provider: string;
  image_url: string | null;
  max_win: number | null;
  rtp: number | null;
  volatility: string | null;
}

interface PersonalBest {
  max_win: number;
  max_multiplier: number;
  total_bonuses: number;
}

interface ChillSessionOverlayProps {
  sessionId?: string;
  embedded?: boolean;
  frozen?: boolean;
}

export function ChillSessionOverlay({ sessionId, embedded = false, frozen = false }: ChillSessionOverlayProps = {}) {
  const [session, setSession] = useState<ChillSession | null>(null);
  const [brandLogo, setBrandLogo] = useState<BrandLogo | null>(null);
  const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadSessionById(sessionId);
    } else {
      loadActiveSession();
    }

    // Only subscribe to realtime updates if not frozen
    if (frozen) {
      return;
    }

    const channel = supabase
      .channel('chill_overlay_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_sessions' }, () => {
        if (sessionId) {
          loadSessionById(sessionId);
        } else {
          loadActiveSession();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_logos' }, () => {
        if (session?.brand_logo_id) {
          loadBrandLogo(session.brand_logo_id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        if (session?.slot_name) {
          loadSlotInfo(session.slot_name);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, frozen]);

  useEffect(() => {
    if (session) {
      if (session.brand_logo_id) {
        loadBrandLogo(session.brand_logo_id);
      }
      if (session.slot_name) {
        loadSlotInfo(session.slot_name);
        loadPersonalBest(session.slot_name);
      }
    }
  }, [session?.id, session?.slot_name, session?.brand_logo_id]);


  const loadSessionById = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('chill_sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data && !data.show_on_main_overlay) {
        console.log('[ChillSessionOverlay] Session is not active on main overlay, clearing...');
        setSession(null);
        return;
      }

      setSession(data);
    } catch (error) {
      console.error('Error loading session by ID:', error);
    }
  };

  const loadActiveSession = async () => {
    try {
      const { data, error } = await supabase
        .from('chill_sessions')
        .select('*')
        .is('ended_at', null)
        .eq('show_on_main_overlay', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSession(data);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const loadBrandLogo = async (logoId: string) => {
    try {
      const { data, error } = await supabase
        .from('brand_logos')
        .select('*')
        .eq('id', logoId)
        .single();

      if (error) throw error;
      setBrandLogo(data);
    } catch (error) {
      console.error('Error loading brand logo:', error);
    }
  };

  const loadSlotInfo = async (slotName: string) => {
    try {
      const { data, error } = await supabase
        .from('slots')
        .select('*')
        .ilike('name', slotName)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSlotInfo(data);
    } catch (error) {
      console.error('Error loading slot info:', error);
    }
  };

  const loadPersonalBest = async (slotName: string) => {
    try {
      // Get all chill sessions for this slot
      const { data: chillSessions, error: chillError } = await supabase
        .from('chill_sessions')
        .select('max_win, max_multiplier, total_bonuses')
        .ilike('slot_name', slotName);

      if (chillError) throw chillError;

      // Get all bonus hunt items for this slot
      const { data: huntItems, error: huntError } = await supabase
        .from('bonus_hunt_items')
        .select('result_amount, payment_amount, bet_amount, status')
        .ilike('slot_name', slotName)
        .eq('status', 'opened');

      if (huntError) throw huntError;

      let maxWin = 0;
      let maxMultiplier = 0;
      let totalBonuses = 0;

      // Process chill sessions
      if (chillSessions && chillSessions.length > 0) {
        chillSessions.forEach(session => {
          if (session.max_win > maxWin) maxWin = session.max_win;
          if (session.max_multiplier > maxMultiplier) maxMultiplier = session.max_multiplier;
          totalBonuses += session.total_bonuses || 0;
        });
      }

      // Process bonus hunt items
      if (huntItems && huntItems.length > 0) {
        huntItems.forEach(item => {
          if (item.result_amount) {
            if (item.result_amount > maxWin) maxWin = item.result_amount;

            const payment = item.payment_amount || item.bet_amount;
            const multiplier = item.result_amount / payment;
            if (multiplier > maxMultiplier) maxMultiplier = multiplier;

            totalBonuses += 1;
          }
        });
      }

      if (maxWin > 0 || totalBonuses > 0) {
        setPersonalBest({
          max_win: maxWin,
          max_multiplier: maxMultiplier,
          total_bonuses: totalBonuses
        });
      } else {
        setPersonalBest(null);
      }
    } catch (error) {
      console.error('Error loading personal best:', error);
    }
  };

  const renderPlaceholderOverlay = () => {
    return (
      <div className={`${embedded ? 'w-full h-full' : 'w-screen h-screen'} bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10 text-center space-y-8">
          <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl flex items-center justify-center border-2 border-blue-400/30 backdrop-blur-sm">
            <Zap className="w-16 h-16 text-blue-400" />
          </div>

          <div className="space-y-3">
            <h1 className="text-5xl font-black text-white uppercase tracking-wider">
              Modo Chill
            </h1>
            <p className="text-2xl text-blue-300 font-semibold">
              Aguardando sessão...
            </p>
          </div>

          <div className="flex items-center justify-center gap-8 pt-8">
            <div className="text-center">
              <div className="text-gray-400 text-sm uppercase tracking-widest mb-2">Slots Jogados</div>
              <div className="text-4xl font-bold text-white">-</div>
            </div>
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-blue-400/50 to-transparent" />
            <div className="text-center">
              <div className="text-gray-400 text-sm uppercase tracking-widest mb-2">Melhor Multi</div>
              <div className="text-4xl font-bold text-white">-</div>
            </div>
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-blue-400/50 to-transparent" />
            <div className="text-center">
              <div className="text-gray-400 text-sm uppercase tracking-widest mb-2">Maior Win</div>
              <div className="text-4xl font-bold text-white">-</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 text-center">
          <div className="text-blue-300/50 text-sm uppercase tracking-wider animate-pulse">
            Inicie uma sessão para começar
          </div>
        </div>
      </div>
    );
  };

  const hasSession = !!session;

  const slotImageUrl = slotInfo?.image_url || '';
  const maxWin = slotInfo?.max_win ? `${slotInfo.max_win.toFixed(0)}x` : '10000x';
  const rtp = slotInfo?.rtp ? `${slotInfo.rtp.toFixed(2)}%` : '96.00%';
  const volatility = slotInfo?.volatility || 'Medium';

  const getElapsedTime = () => {
    if (!session) return '0m';
    const start = new Date(session.started_at);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000 / 60);
    return `${diff}m`;
  };

  return (
    <div className="w-[288px] h-[720px] relative" style={{ marginTop: '0px', marginLeft: '62px' }}>
      <div
        className="w-full h-full overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px'
        }}
      >
        <div className="relative">

          {hasSession ? (
            slotImageUrl ? (
              <div className="relative w-full h-[320px] overflow-hidden">
                <img
                  src={slotImageUrl}
                  alt={session?.slot_name}
                  className="w-full h-full object-cover object-top animate-pulse-zoom"
                />
              </div>
            ) : (
              <div
                className="relative w-full aspect-square flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
              >
                <div className="text-center p-8">
                  <h1
                    className="text-4xl font-black uppercase tracking-tight text-white mb-2"
                    style={{ textShadow: '3px 3px 6px rgba(0,0,0,0.4)' }}
                  >
                    {session?.slot_name}
                  </h1>
                  <p
                    className="text-base font-bold uppercase text-white/90"
                    style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.4)' }}
                  >
                    {slotInfo?.provider || 'Provider'}
                  </p>
                </div>
              </div>
            )
          ) : (
            <div
              className="relative w-full aspect-square flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
            >
              <div className="text-center p-8">
                <h1
                  className="text-2xl font-black uppercase tracking-tight text-white"
                  style={{ textShadow: '3px 3px 6px rgba(0,0,0,0.4)' }}
                >
                  AGUARDANDO SESSÃO...
                </h1>
              </div>
            </div>
          )}

          {brandLogo && hasSession && (
            <div className="absolute bottom-4 left-4">
              <img
                src={brandLogo.logo_url}
                alt={brandLogo.name}
                className="h-8 object-contain"
                style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}
              />
            </div>
          )}
        </div>

        {hasSession && (
          <div
            className="p-4 flex-shrink-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#34d399' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#34d399' }}
              >
                SLOT INFO
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}
                >
                  <Trophy className="w-4 h-4" style={{ color: '#60a5fa' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    Max Win
                  </div>
                  <div className="text-base font-black text-white">{maxWin}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(34, 211, 238, 0.2)' }}
                >
                  <TrendingUp className="w-4 h-4" style={{ color: '#22d3ee' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    RTP
                  </div>
                  <div className="text-base font-black text-white">{rtp}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}
                >
                  <Zap className="w-4 h-4" style={{ color: '#a855f7' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    Volatility
                  </div>
                  <div className="text-base font-black text-white">{volatility}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasSession && (
          <div
            className="p-4 space-y-2 flex-1 overflow-hidden"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.7))' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: '#fbbf24' }}
              ></div>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#fbbf24' }}
              >
                PERSONAL BEST
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}
                >
                  <Trophy className="w-4 h-4" style={{ color: '#fbbf24' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    Best Win
                  </div>
                  <div className="text-base font-black text-white">
                    €{personalBest ? personalBest.max_win.toFixed(2) : session?.max_win.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(236, 72, 153, 0.2)' }}
                >
                  <Star className="w-4 h-4" style={{ color: '#ec4899' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    Best Multi
                  </div>
                  <div className="text-base font-black text-white">
                    {personalBest ? personalBest.max_multiplier.toFixed(0) : session?.max_multiplier.toFixed(0)}x
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
                >
                  <Target className="w-4 h-4" style={{ color: '#10b981' }} />
                </div>
                <div className="flex-1">
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    Total Bonuses
                  </div>
                  <div className="text-base font-black text-white">
                    {personalBest ? personalBest.total_bonuses : session?.total_bonuses}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
