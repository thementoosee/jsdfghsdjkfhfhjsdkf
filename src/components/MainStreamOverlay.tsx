import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChillSessionOverlay } from './ChillSessionOverlay';
import { GiveawayOverlay } from './GiveawayOverlay';
import { BonusHuntOverlay } from './bonus-hunt/BonusHuntOverlay';
import { BonusOpeningOverlay } from './bonus-hunt/BonusOpeningOverlay';
import { FeverChampionsOverlay } from './FeverChampionsOverlay';

type OverlayType = 'chill' | 'hunt' | 'opening' | 'tournament' | null;

interface OverlayState {
  type: OverlayType;
  id: string | null;
}

export function MainStreamOverlay() {
  const [barOverlayId, setBarOverlayId] = useState<string | null>(null);
  const [chatOverlayId, setChatOverlayId] = useState<string | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>({
    type: null,
    id: null,
  });
  const [leavingOverlay, setLeavingOverlay] = useState<OverlayState | null>(null);
  const [enteringOverlay, setEnteringOverlay] = useState<OverlayState | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const EXIT_DURATION_MS = 450;
  const SWITCH_DELAY_MS = 2000;
  const ENTER_DURATION_MS = 450;

  useEffect(() => {
    initializeOverlays();
    const cleanup = subscribeToChanges();

    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (enterStartTimerRef.current) clearTimeout(enterStartTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cleanup();
    };
  }, []);

  const initializeOverlays = async () => {
    const { data: barData } = await supabase
      .from('overlays')
      .select('*')
      .eq('type', 'bar')
      .maybeSingle();
    if (barData) setBarOverlayId(barData.id);

    const { data: chatData } = await supabase
      .from('overlays')
      .select('*')
      .eq('type', 'chat')
      .maybeSingle();
    if (chatData) setChatOverlayId(chatData.id);

    const { data: activeOpening } = await supabase
      .from('bonus_openings')
      .select('id')
      .eq('show_on_main_overlay', true)
      .maybeSingle();

    console.log('[Main Init] Active Opening:', activeOpening);

    if (activeOpening) {
      console.log('[Main Init] Setting overlay to opening:', activeOpening.id);
      setOverlayState({ type: 'opening', id: activeOpening.id });
      return;
    }

    const { data: activeHunt } = await supabase
      .from('bonus_hunts')
      .select('id')
      .eq('show_on_main_overlay', true)
      .maybeSingle();

    console.log('[Main Init] Active Hunt:', activeHunt);

    if (activeHunt) {
      console.log('[Main Init] Setting overlay to hunt:', activeHunt.id);
      setOverlayState({ type: 'hunt', id: activeHunt.id });
      return;
    }

    const { data: activeTournament } = await supabase
      .from('fever_tournaments')
      .select('id')
      .eq('show_on_main_overlay', true)
      .eq('status', 'active')
      .maybeSingle();

    console.log('[Main Init] Active Tournament:', activeTournament);

    if (activeTournament) {
      console.log('[Main Init] Setting overlay to tournament:', activeTournament.id);
      setOverlayState({ type: 'tournament', id: activeTournament.id });
      return;
    }

    let { data: chillSession } = await supabase
      .from('chill_sessions')
      .select('id')
      .is('ended_at', null)
      .eq('show_on_main_overlay', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[Main Init] Active Chill:', chillSession);

    if (!chillSession) {
      const { data: anyActiveSession } = await supabase
        .from('chill_sessions')
        .select('id')
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyActiveSession) {
        await supabase
          .from('chill_sessions')
          .update({ show_on_main_overlay: true })
          .eq('id', anyActiveSession.id);
        chillSession = anyActiveSession;
      }
    }

    if (chillSession) {
      console.log('[Main Init] Setting overlay to chill:', chillSession.id);
      setOverlayState({ type: 'chill', id: chillSession.id });
    }
  };

  const subscribeToChanges = () => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = async (payload?: any) => {
      console.log(`[Main] 🔄 ${payload?.table} changed`, payload);

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        const { data: activeOpening } = await supabase
          .from('bonus_openings')
          .select('id, show_on_main_overlay, status')
          .eq('show_on_main_overlay', true)
          .maybeSingle();

        if (activeOpening) {
          console.log('[Main] ✅ → Opening', activeOpening.id);
          transitionTo('opening', activeOpening.id);
          return;
        }

        const { data: activeHunt } = await supabase
          .from('bonus_hunts')
          .select('id, show_on_main_overlay, status')
          .eq('show_on_main_overlay', true)
          .maybeSingle();

        if (activeHunt) {
          console.log('[Main] ✅ → Hunt', activeHunt.id);
          transitionTo('hunt', activeHunt.id);
          return;
        }

        const { data: activeTournament } = await supabase
          .from('fever_tournaments')
          .select('id, show_on_main_overlay, status')
          .eq('show_on_main_overlay', true)
          .eq('status', 'active')
          .maybeSingle();

        if (activeTournament) {
          console.log('[Main] ✅ → Tournament', activeTournament.id);
          transitionTo('tournament', activeTournament.id);
          return;
        }

        const { data: activeChill } = await supabase
          .from('chill_sessions')
          .select('id, show_on_main_overlay, ended_at')
          .is('ended_at', null)
          .eq('show_on_main_overlay', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeChill) {
          console.log('[Main] ✅ → Chill', activeChill.id);
          transitionTo('chill', activeChill.id);
        } else {
          console.log('[Main] ⚪ No overlay');
          transitionTo(null, null);
        }
      }, 100);
    };

    const chillChannel = supabase
      .channel('overlay_changes_chill')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_sessions' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Chill channel status:', status);
      });

    const huntChannel = supabase
      .channel('overlay_changes_hunt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunts' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Hunt channel status:', status);
      });

    const openingChannel = supabase
      .channel('overlay_changes_opening')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_openings' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Opening channel status:', status);
      });

    const overlaysChannel = supabase
      .channel('overlay_changes_overlays')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overlays' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Overlays channel status:', status);
      });

    const tournamentChannel = supabase
      .channel('overlay_changes_tournament')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_tournaments' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Tournament channel status:', status);
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(chillChannel);
      supabase.removeChannel(huntChannel);
      supabase.removeChannel(openingChannel);
      supabase.removeChannel(overlaysChannel);
      supabase.removeChannel(tournamentChannel);
    };
  };

  const transitionTo = (type: OverlayType, id: string | null) => {
    const nextOverlay: OverlayState = { type, id };

    if (overlayState.type === nextOverlay.type && overlayState.id === nextOverlay.id) {
      return;
    }

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (enterStartTimerRef.current) clearTimeout(enterStartTimerRef.current);
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);

    const currentOverlay = overlayState.type ? overlayState : null;

    if (!currentOverlay && nextOverlay.type) {
      setEnteringOverlay(nextOverlay);
      cleanupTimerRef.current = setTimeout(() => {
        setOverlayState(nextOverlay);
        setEnteringOverlay(null);
      }, ENTER_DURATION_MS);
      return;
    }

    setLeavingOverlay(currentOverlay);
    setEnteringOverlay(null);

    exitTimerRef.current = setTimeout(() => {
      setLeavingOverlay(null);
      setOverlayState({ type: null, id: null });
    }, EXIT_DURATION_MS);

    if (!nextOverlay.type) {
      return;
    }

    enterStartTimerRef.current = setTimeout(() => {
      setEnteringOverlay(nextOverlay);
    }, EXIT_DURATION_MS + SWITCH_DELAY_MS);

    cleanupTimerRef.current = setTimeout(() => {
      setOverlayState(nextOverlay);
      setEnteringOverlay(null);
    }, EXIT_DURATION_MS + SWITCH_DELAY_MS + ENTER_DURATION_MS);
  };

  const renderLeftOverlay = (state: OverlayState | null) => {
    if (!state?.type || !state.id) return null;

    if (state.type === 'chill') {
      return <ChillSessionOverlay sessionId={state.id} embedded />;
    }

    if (state.type === 'hunt') {
      return <BonusHuntOverlay huntId={state.id} />;
    }

    if (state.type === 'opening') {
      return <BonusOpeningOverlay openingId={state.id} />;
    }

    if (state.type === 'tournament') {
      return <FeverChampionsOverlay embedded />;
    }

    return null;
  };

  return (
    <div className="w-[1920px] h-[1080px] bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 relative overflow-hidden" style={{ margin: 0, padding: 0 }}>
      <style>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes slideOutToRight {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(100%);
          }
        }

        .slide-in-left-overlay {
          animation: slideInFromRight 0.45s ease-out forwards;
        }

        .slide-out-overlay {
          animation: slideOutToRight 0.45s ease-in forwards;
        }

        .overlay-layer {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .no-overlay-effects * {
          animation: none !important;
          transition: none !important;
        }
      `}</style>

      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(147, 51, 234, 0.3) 0%, transparent 50%)',
        }}></div>
      </div>

      <div className="relative z-10 h-full flex flex-col">
        {barOverlayId && (
          <div className="w-full">
            <iframe
              src={`/overlay/${barOverlayId}`}
              className="w-full h-[50px] border-0"
              style={{ pointerEvents: 'none' }}
            />
          </div>
        )}

        <div className="flex-1 flex items-start justify-center px-[20px] pt-[10px] pb-[20px]">
          <div className="flex gap-[8px] h-[720px] w-full">
            <div className="w-[350px] flex-shrink-0 h-full relative">
              {leavingOverlay && (
                <div className="overlay-layer slide-out-overlay h-full">
                  <div className="h-full no-overlay-effects">
                    {renderLeftOverlay(leavingOverlay)}
                  </div>
                </div>
              )}

              {enteringOverlay && (
                <div className="overlay-layer slide-in-left-overlay h-full">
                  <div className="h-full no-overlay-effects">
                    {renderLeftOverlay(enteringOverlay)}
                  </div>
                </div>
              )}

              {!leavingOverlay && !enteringOverlay && (
                <div className="h-full">
                  <div className="h-full no-overlay-effects">
                    {renderLeftOverlay(overlayState)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 h-full flex items-center justify-center relative">
              <div
                className="w-full h-full"
                style={{
                  border: '2px solid rgba(59, 130, 246, 0.5)',
                  borderRadius: '16px'
                }}
              >
              </div>
            </div>

            <div className="w-[350px] flex-shrink-0 h-full relative overflow-visible">
              {chatOverlayId && (
                <iframe
                  src={`/overlay/${chatOverlayId}`}
                  className="w-full h-full border-0"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
