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
  MAIN_OVERLAY_FLIP_DURATION_MS,
  MAIN_OVERLAY_FLIP_EASING,
  planMainOverlayFlip,
  sameMainOverlayIdentity,
} from '../lib/main-overlay-flip';
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

interface FlipTransition {
  from: OverlayState;
  to: OverlayState;
  /** Remount key so a queued flip always restarts the CSS animation cleanly. */
  key: number;
}

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
 * Prefetch face data before the FLIP remounts overlays, so the destination
 * (and remounted source) never paint «AGUARDANDO SESSÃO...» mid-transition.
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

export function MainStreamOverlay() {
  const [barOverlayId, setBarOverlayId] = useState<string | null>(null);
  const [chatOverlayId, setChatOverlayId] = useState<string | null>(null);
  const [showSecondSlot, setShowSecondSlot] = useState(true);
  const [overlayState, setOverlayState] = useState<OverlayState>({
    type: null,
    id: null,
  });
  const [flip, setFlip] = useState<FlipTransition | null>(null);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipKeyRef = useRef(0);
  const flippingRef = useRef(false);
  const pendingTargetRef = useRef<OverlayState | null>(null);
  /** Desired / in-flight target — Realtime dedupe reads this, not only settled UI state. */
  const overlayStateRef = useRef<OverlayState>({ type: null, id: null });
  /** Settled face shown when not flipping (source for the next front face). */
  const settledStateRef = useRef<OverlayState>({ type: null, id: null });

  useEffect(() => {
    initializeOverlays();
    const cleanup = subscribeToChanges();

    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
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

  const finishFlipTo = (landed: OverlayState) => {
    flippingRef.current = false;
    settledStateRef.current = landed;
    overlayStateRef.current = landed;
    setOverlayState(landed);
    setFlip(null);

    const pending = pendingTargetRef.current;
    pendingTargetRef.current = null;
    if (pending && (pending.type !== landed.type || pending.id !== landed.id)) {
      startFlip(landed, pending);
    }
  };

  const startFlip = (from: OverlayState, to: OverlayState) => {
    flippingRef.current = true;
    overlayStateRef.current = to;

    void (async () => {
      // Keep the settled overlay visible while warming — then flip once faces are ready.
      await Promise.all([warmOverlayFace(from), warmOverlayFace(to)]);

      let target = to;
      const pending = pendingTargetRef.current;
      if (pending) {
        pendingTargetRef.current = null;
        if (!sameMainOverlayIdentity(pending, to)) {
          target = pending;
          await warmOverlayFace(target);
        }
      }

      overlayStateRef.current = target;
      flipKeyRef.current += 1;
      setFlip({ from: settledStateRef.current, to: target, key: flipKeyRef.current });

      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
      flipTimerRef.current = setTimeout(() => {
        finishFlipTo(target);
      }, MAIN_OVERLAY_FLIP_DURATION_MS);
    })();
  };

  const transitionTo = (type: OverlayType, id: string | null) => {
    const nextOverlay: OverlayState = { type, id };
    const plan = planMainOverlayFlip({
      current: overlayStateRef.current,
      next: nextOverlay,
      flipping: flippingRef.current,
      pending: pendingTargetRef.current,
    });

    if (plan === 'noop') return;

    if (plan === 'queue') {
      pendingTargetRef.current = nextOverlay;
      overlayStateRef.current = nextOverlay;
      return;
    }

    startFlip(settledStateRef.current, nextOverlay);
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

  return (
    <div
      className="w-[1920px] h-[1080px] relative overflow-hidden"
      style={{ margin: 0, padding: 0, background: 'transparent' }}
    >
      <style>{`
        @keyframes mainOverlayFlipY {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(-180deg); }
        }

        .main-overlay-flip-scene {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          isolation: isolate;
          contain: paint;
          clip-path: inset(0);
          perspective: ${MAIN_OVERLAY_SIDEBAR_WIDTH_PX * 4}px;
          perspective-origin: 50% 50%;
        }

        .main-overlay-flip-card {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          animation: mainOverlayFlipY ${MAIN_OVERLAY_FLIP_DURATION_MS}ms ${MAIN_OVERLAY_FLIP_EASING} forwards;
        }

        .main-overlay-flip-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: preserve-3d;
        }

        .main-overlay-flip-face-front {
          transform: rotateY(0deg);
        }

        .main-overlay-flip-face-back {
          transform: rotateY(180deg);
        }

        .main-overlay-flip-face .no-overlay-effects *,
        .main-overlay-flip-card .no-overlay-effects * {
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
              Fixed sidebar frame only — perspective/transform live here.
              Never applied to Slot View / casino / root chrome.
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
              {flip ? (
                <div className="main-overlay-flip-scene h-full w-full">
                  <div className="main-overlay-flip-card" key={flip.key}>
                    <div className="main-overlay-flip-face main-overlay-flip-face-front">
                      <div className="h-full w-full no-overlay-effects">
                        {renderLeftOverlay(flip.from)}
                      </div>
                    </div>
                    <div className="main-overlay-flip-face main-overlay-flip-face-back">
                      <div className="h-full w-full no-overlay-effects">
                        {renderLeftOverlay(flip.to)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full w-full overflow-hidden" style={{ contain: 'paint' }}>
                  {renderLeftOverlay(overlayState)}
                </div>
              )}
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
