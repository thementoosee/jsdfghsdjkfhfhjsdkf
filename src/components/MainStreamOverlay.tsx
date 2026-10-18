import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  MAIN_OVERLAY_CENTER_HEIGHT_PX,
  MAIN_OVERLAY_SIDEBAR_WIDTH_PX,
  getMainOverlayBackgroundMaskUrl,
  getMainOverlayCasinoCutout,
  getMainOverlaySecondSlotCutout,
} from '../lib/overlay-layout';
import { parseShowSecondSlot } from '../lib/overlay-modules';
import {
  MAIN_OVERLAY_SLIDE_ENTER_MS,
  MAIN_OVERLAY_SLIDE_EXIT_MS,
  MAIN_OVERLAY_SLIDE_HIDDEN_MIN_MS,
  MAIN_OVERLAY_SLIDE_EASING,
  planMainOverlaySlide,
  sameMainOverlayIdentity,
} from '../lib/main-overlay-slide';
import { pickMainOverlay, type MainOverlayKind } from '../lib/main-overlay-priority';
import {
  seedChillOverlayFace,
  seedHuntOverlayFace,
} from '../lib/main-overlay-face-seed';
import { ChillSessionOverlay } from './ChillSessionOverlay';
import { BonusHuntOverlay } from './bonus-hunt/BonusHuntOverlay';
import { BonusOpeningOverlay } from './bonus-hunt/BonusOpeningOverlay';
import { FeverChampionsOverlay } from './FeverChampionsOverlay';
import { BonusTournamentOverlayPreview } from './bonus-tournament/BonusTournamentOverlayPreview';
import { ShopHighlightsOverlay, SHOP_HIGHLIGHT_CARD_HEIGHT_PX } from './ShopHighlightsOverlay';

type OverlayType = MainOverlayKind;

interface OverlayState {
  type: OverlayType;
  id: string | null;
}

/** Visual phase of the sidebar SLIDE — content swaps only while `preparing` (fully hidden). */
type SlidePhase = 'idle' | 'exiting' | 'preparing' | 'entering';

async function resolveMainOverlayTarget(): Promise<OverlayState> {
  const { data: activeOpening } = await supabase
    .from('bonus_openings')
    .select('id')
    .eq('show_on_main_overlay', true)
    .maybeSingle();

  const { data: activeHunt } = await supabase
    .from('bonus_hunts')
    .select('id')
    .eq('show_on_main_overlay', true)
    .maybeSingle();

  const { data: activeFever } = await supabase
    .from('fever_tournaments')
    .select('id')
    .eq('show_on_main_overlay', true)
    .eq('status', 'active')
    .maybeSingle();

  const { data: activeChill } = await supabase
    .from('chill_sessions')
    .select('id')
    .is('ended_at', null)
    .eq('show_on_main_overlay', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Bonus Tournament REAL — exclusive ACTIVE row (source of truth for OBS sync).
  const { data: activeBt } = await supabase
    .from('bonus_tournaments')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();

  return pickMainOverlay({
    openingId: activeOpening?.id ?? null,
    huntId: activeHunt?.id ?? null,
    feverId: activeFever?.id ?? null,
    chillId: activeChill?.id ?? null,
    bonusTournamentId: activeBt?.id ?? null,
  });
}

/**
 * When nothing claims main (Opening > Hunt > Fever > manual Chill > ACTIVE BT),
 * auto-claim a live chill session so CHILL is the default fallback.
 * Does not alter tournament rows; safe to call on every resolve.
 */
async function ensureChillFallback(current: OverlayState): Promise<OverlayState> {
  if (current.type) return current;

  const { data: anyActiveSession } = await supabase
    .from('chill_sessions')
    .select('id')
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anyActiveSession?.id) return current;

  await supabase
    .from('chill_sessions')
    .update({ show_on_main_overlay: true })
    .eq('id', anyActiveSession.id);

  return { type: 'chill', id: anyActiveSession.id };
}

/**
 * Prefetch overlay data before slide-in remounts, so the destination
 * never paints «AGUARDANDO SESSÃO...» (preserved from 3723995).
 */
async function warmOverlayFace(state: OverlayState): Promise<void> {
  if (!state.type || !state.id) return;

  if (state.type === 'chill') {
    const { data } = await supabase
      .from('chill_sessions')
      .select('*')
      .eq('id', state.id)
      .maybeSingle();
    if (data) seedChillOverlayFace(state.id, data);
    return;
  }

  if (state.type === 'hunt') {
    const { data: hunt } = await supabase
      .from('bonus_hunts')
      .select('*')
      .eq('id', state.id)
      .maybeSingle();
    if (!hunt) return;
    const { data: items } = await supabase
      .from('bonus_hunt_items')
      .select('*, slots:slot_id(image_storage_path, image_url)')
      .eq('hunt_id', state.id)
      .order('order_index', { ascending: true });
    seedHuntOverlayFace(state.id, hunt, items ?? []);
  }
}

function slidePanelClass(phase: SlidePhase): string {
  if (phase === 'exiting') return 'main-overlay-slide-panel main-overlay-slide-out';
  if (phase === 'preparing') return 'main-overlay-slide-panel main-overlay-slide-hidden';
  if (phase === 'entering') return 'main-overlay-slide-panel main-overlay-slide-in';
  return 'main-overlay-slide-panel';
}

export function MainStreamOverlay() {
  const [barOverlayId, setBarOverlayId] = useState<string | null>(null);
  const [chatOverlayId, setChatOverlayId] = useState<string | null>(null);
  const [showSecondSlot, setShowSecondSlot] = useState(true);
  const [overlayState, setOverlayState] = useState<OverlayState>({
    type: null,
    id: null,
  });
  const [slidePhase, setSlidePhase] = useState<SlidePhase>('idle');
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slidingRef = useRef(false);
  const pendingTargetRef = useRef<OverlayState | null>(null);
  /** Desired / in-flight target — Realtime dedupe reads this, not only settled UI state. */
  const overlayStateRef = useRef<OverlayState>({ type: null, id: null });
  /** Settled content shown when idle (source for the next slide-out). */
  const settledStateRef = useRef<OverlayState>({ type: null, id: null });
  /** Bumps when a slide sequence is superseded so stale timers/async ignore results. */
  const slideGenRef = useRef(0);

  useEffect(() => {
    initializeOverlays();
    const cleanup = subscribeToChanges();

    return () => {
      slideGenRef.current += 1;
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      cleanup();
    };
  }, []);

  const applyMainStreamConfig = (config: Record<string, unknown> | null | undefined) => {
    setShowSecondSlot(parseShowSecondSlot(config));
  };

  const initializeOverlays = async () => {
    const { data: barRows, error: barError } = await supabase
      .from('overlays')
      .select('*')
      .eq('type', 'bar')
      .order('created_at', { ascending: true })
      .limit(1);
    if (barError) console.error('[Main Init] Error loading bar overlay:', barError);
    if (barRows?.[0]) setBarOverlayId(barRows[0].id);

    const { data: chatRows, error: chatError } = await supabase
      .from('overlays')
      .select('*')
      .eq('type', 'chat')
      .order('created_at', { ascending: true })
      .limit(1);
    if (chatError) console.error('[Main Init] Error loading chat overlay:', chatError);
    if (chatRows?.[0]) setChatOverlayId(chatRows[0].id);

    const { data: mainRows, error: mainError } = await supabase
      .from('overlays')
      .select('id, config')
      .eq('type', 'main_stream')
      .order('created_at', { ascending: true })
      .limit(1);
    if (mainError) console.error('[Main Init] Error loading main_stream config:', mainError);
    if (mainRows?.[0]) applyMainStreamConfig(mainRows[0].config as Record<string, unknown>);

    const initial = await ensureChillFallback(await resolveMainOverlayTarget());
    console.log('[Main Init] Overlay target:', initial);
    overlayStateRef.current = initial;
    settledStateRef.current = initial;
    setOverlayState(initial);
  };

  const subscribeToChanges = () => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = async (payload?: { table?: string }) => {
      console.log(`[Main] 🔄 ${payload?.table} changed`, payload);

      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        const next = await ensureChillFallback(await resolveMainOverlayTarget());
        console.log('[Main] ✅ →', next.type, next.id);
        transitionTo(next.type, next.id);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overlays' }, (payload) => {
        const row = (payload.new || payload.old) as { type?: string; config?: Record<string, unknown> } | undefined;
        if (row?.type === 'main_stream' && payload.new && 'config' in (payload.new as object)) {
          applyMainStreamConfig((payload.new as { config?: Record<string, unknown> }).config);
        }
        handleChange(payload);
      })
      .subscribe((status) => {
        console.log('[Main] Overlays channel status:', status);
      });

    const feverChannel = supabase
      .channel('overlay_changes_fever')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_tournaments' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Fever channel status:', status);
      });

    const bonusTournamentChannel = supabase
      .channel('overlay_changes_bonus_tournament')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_tournaments' }, handleChange)
      .subscribe((status) => {
        console.log('[Main] Bonus Tournament channel status:', status);
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(chillChannel);
      supabase.removeChannel(huntChannel);
      supabase.removeChannel(openingChannel);
      supabase.removeChannel(overlaysChannel);
      supabase.removeChannel(feverChannel);
      supabase.removeChannel(bonusTournamentChannel);
    };
  };

  const clearSlideTimers = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    exitTimerRef.current = null;
    enterTimerRef.current = null;
  };

  const finishSlideTo = (landed: OverlayState, gen: number) => {
    if (gen !== slideGenRef.current) return;

    slidingRef.current = false;
    settledStateRef.current = landed;
    overlayStateRef.current = landed;
    setOverlayState(landed);
    setSlidePhase('idle');

    const pending = pendingTargetRef.current;
    pendingTargetRef.current = null;
    if (pending && !sameMainOverlayIdentity(pending, landed)) {
      startSlide(landed, pending);
    }
  };

  const beginEnter = (target: OverlayState, gen: number) => {
    if (gen !== slideGenRef.current) return;

    // Content already swapped while hidden — animate back to rest without remounting.
    setSlidePhase('entering');
    enterTimerRef.current = setTimeout(() => {
      finishSlideTo(target, gen);
    }, MAIN_OVERLAY_SLIDE_ENTER_MS);
  };

  const prepareAndEnter = async (to: OverlayState, gen: number) => {
    if (gen !== slideGenRef.current) return;

    setSlidePhase('preparing');
    const hiddenStartedAt = performance.now();

    const warmSafe = async (state: OverlayState) => {
      try {
        await warmOverlayFace(state);
      } catch (err) {
        console.error('[Main] Overlay warm failed; continuing with mount fetch:', err);
      }
    };

    let target = to;
    await warmSafe(target);

    if (gen !== slideGenRef.current) return;

    const pending = pendingTargetRef.current;
    if (pending) {
      pendingTargetRef.current = null;
      if (!sameMainOverlayIdentity(pending, target)) {
        target = pending;
        await warmSafe(target);
        if (gen !== slideGenRef.current) return;
      }
    }

    // Minimum hidden dwell (2s); extend if warm already took longer.
    const remainingHidden =
      MAIN_OVERLAY_SLIDE_HIDDEN_MIN_MS - (performance.now() - hiddenStartedAt);
    if (remainingHidden > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, remainingHidden);
      });
      if (gen !== slideGenRef.current) return;
    }

    // Re-check queue after the dwell so rapid mode changes land on the latest target.
    const pendingAfterWait = pendingTargetRef.current;
    if (pendingAfterWait) {
      pendingTargetRef.current = null;
      if (!sameMainOverlayIdentity(pendingAfterWait, target)) {
        target = pendingAfterWait;
        await warmSafe(target);
        if (gen !== slideGenRef.current) return;
      }
    }

    overlayStateRef.current = target;
    // Swap content only while fully off-screen (translateX 100%).
    setOverlayState(target);

    // Double rAF so the browser paints the hidden new face before slide-in starts.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        beginEnter(target, gen);
      });
    });
  };

  const startSlide = (from: OverlayState, to: OverlayState) => {
    slidingRef.current = true;
    overlayStateRef.current = to;
    const gen = ++slideGenRef.current;
    clearSlideTimers();

    const hasFrom = Boolean(from.type && from.id);
    const hasTo = Boolean(to.type && to.id);

    // Keep settled content on screen for slide-out (single panel — no dual faces).
    setOverlayState(hasFrom ? from : settledStateRef.current);

    if (!hasFrom && hasTo) {
      // Cold enter: nothing to slide out.
      void prepareAndEnter(to, gen);
      return;
    }

    if (hasFrom) {
      setSlidePhase('exiting');
      exitTimerRef.current = setTimeout(() => {
        if (!hasTo) {
          // Real empty — slide out and stay clear.
          if (gen !== slideGenRef.current) return;
          setOverlayState({ type: null, id: null });
          finishSlideTo({ type: null, id: null }, gen);
          return;
        }
        void prepareAndEnter(to, gen);
      }, MAIN_OVERLAY_SLIDE_EXIT_MS);
      return;
    }

    // Neither side has content.
    finishSlideTo({ type: null, id: null }, gen);
  };

  const transitionTo = (type: OverlayType, id: string | null) => {
    const nextOverlay: OverlayState = { type, id };
    const plan = planMainOverlaySlide({
      current: overlayStateRef.current,
      next: nextOverlay,
      sliding: slidingRef.current,
      pending: pendingTargetRef.current,
    });

    if (plan === 'noop') return;

    if (plan === 'queue') {
      pendingTargetRef.current = nextOverlay;
      overlayStateRef.current = nextOverlay;
      return;
    }

    startSlide(settledStateRef.current, nextOverlay);
  };

  const renderLeftOverlay = (state: OverlayState | null) => {
    if (!state?.type || !state.id) return null;

    if (state.type === 'chill') {
      return <ChillSessionOverlay sessionId={state.id} embedded />;
    }

    if (state.type === 'hunt') {
      return <BonusHuntOverlay huntId={state.id} embedded />;
    }

    if (state.type === 'opening') {
      return <BonusOpeningOverlay openingId={state.id} />;
    }

    if (state.type === 'fever') {
      return <FeverChampionsOverlay embedded />;
    }

    if (state.type === 'tournament') {
      return <BonusTournamentOverlayPreview embedded />;
    }

    return null;
  };

  const hasTopBar = Boolean(barOverlayId);
  const backgroundMask = getMainOverlayBackgroundMaskUrl(hasTopBar, { showSecondSlot });
  const secondSlot = getMainOverlaySecondSlotCutout(hasTopBar);
  const casinoCutout = getMainOverlayCasinoCutout(hasTopBar);
  const backgroundMaskStyle = {
    WebkitMaskImage: backgroundMask,
    maskImage: backgroundMask,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  } as const;

  const sliding = slidePhase !== 'idle';

  return (
    <div
      className="w-[1920px] h-[1080px] relative overflow-hidden"
      style={{ margin: 0, padding: 0, background: 'transparent' }}
    >
      <style>{`
        @keyframes mainOverlaySlideOutToRight {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }

        @keyframes mainOverlaySlideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .main-overlay-slide-panel {
          position: absolute;
          inset: 0;
          overflow: hidden;
          transform: translateX(0);
          will-change: transform;
        }

        .main-overlay-slide-out {
          animation: mainOverlaySlideOutToRight ${MAIN_OVERLAY_SLIDE_EXIT_MS}ms ${MAIN_OVERLAY_SLIDE_EASING} forwards;
        }

        .main-overlay-slide-hidden {
          transform: translateX(100%);
        }

        .main-overlay-slide-in {
          animation: mainOverlaySlideInFromRight ${MAIN_OVERLAY_SLIDE_ENTER_MS}ms ${MAIN_OVERLAY_SLIDE_EASING} forwards;
        }

        .main-overlay-slide-out .no-overlay-effects *,
        .main-overlay-slide-in .no-overlay-effects *,
        .main-overlay-slide-hidden .no-overlay-effects * {
          animation: none !important;
          transition: none !important;
        }
      `}</style>

      {/* Full-bleed chrome background with casino window cut out (true alpha hole). */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          ...backgroundMaskStyle,
          backgroundImage: 'linear-gradient(to bottom right, #111827, #1e3a8a, #111827)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        aria-hidden
        style={backgroundMaskStyle}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(147, 51, 234, 0.3) 0%, transparent 50%)',
          }}
        />
      </div>

      {/*
        Content layer uses the same casino + Slot View mask as chrome.
        Borders for capture guides sit ABOVE this layer so they stay visible
        while no atmosphere/filter paint can cover OBS holes.
      */}
      <div
        className="relative z-10 h-full flex flex-col"
        style={{ background: 'transparent', ...backgroundMaskStyle }}
      >
        {hasTopBar && (
          <div className="w-full">
            <iframe
              src={`/overlay/${barOverlayId}`}
              className="w-full h-[50px] border-0"
              style={{ pointerEvents: 'none' }}
            />
          </div>
        )}

        <div
          className="flex-1 flex items-start justify-center px-[20px] pt-[10px] pb-[20px]"
          style={{ background: 'transparent' }}
        >
          <div className="flex gap-[8px] h-[720px] w-full" style={{ background: 'transparent' }}>
            {/*
              Fixed sidebar frame only — translateX lives here.
              Slot View / casino stay outside this clip so the sidebar slides behind them.
            */}
            <div
              className="flex-shrink-0 relative overflow-hidden"
              style={{
                width: MAIN_OVERLAY_SIDEBAR_WIDTH_PX,
                height: MAIN_OVERLAY_CENTER_HEIGHT_PX,
                isolation: 'isolate',
                contain: 'paint',
                clipPath: 'inset(0)',
              }}
            >
              <div className={slidePanelClass(slidePhase)}>
                <div className={`h-full w-full${sliding ? ' no-overlay-effects' : ''}`}>
                  {renderLeftOverlay(overlayState)}
                </div>
              </div>
            </div>

            {/* Center column spacer — casino border drawn as sibling guide below. */}
            <div className="flex-1 h-full" style={{ background: 'transparent' }} />

            <div
              className="flex-shrink-0 h-full relative overflow-visible"
              style={{ width: MAIN_OVERLAY_SIDEBAR_WIDTH_PX }}
            >
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: '100%',
                  height: SHOP_HIGHLIGHT_CARD_HEIGHT_PX,
                  zIndex: 0,
                }}
              >
                <ShopHighlightsOverlay />
              </div>

              {chatOverlayId && (
                <iframe
                  src={`/overlay/${chatOverlayId}`}
                  className="relative z-10 w-full h-full border-0"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Capture guides outside masked content — never covered by BT paint. */}
      <div
        className="absolute pointer-events-none z-20"
        aria-hidden
        style={{
          left: casinoCutout.x,
          top: casinoCutout.y,
          width: casinoCutout.width,
          height: casinoCutout.height,
          background: 'transparent',
          border: '2px solid rgba(59, 130, 246, 0.5)',
          borderRadius: casinoCutout.radius,
          boxShadow: 'none',
        }}
      />
      {showSecondSlot && (
        <div
          className="absolute pointer-events-none z-20"
          aria-hidden
          style={{
            left: secondSlot.x,
            top: secondSlot.y,
            width: secondSlot.width,
            height: secondSlot.height,
            background: 'transparent',
            border: '2px solid rgba(59, 130, 246, 0.5)',
            borderRadius: secondSlot.radius,
            boxShadow: 'none',
          }}
        />
      )}

    </div>
  );
}
