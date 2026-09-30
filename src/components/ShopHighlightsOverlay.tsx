import { useEffect, useRef, useState } from 'react';
import {
  clampShopHighlightIndex,
  fetchShopHighlights,
  formatJigadoresPoints,
  getShopHighlightsUrl,
  resolveShopCardBackground,
  resolveShopProductAdvance,
  type ShopHighlight,
} from '../lib/shop-highlights';

/** Animation timings — easy to tune. */
export const SHOP_HIGHLIGHT_SLIDE_MS = 700;
/** Alias / canonical product hold while drawer stays open. */
export const PRODUCT_DISPLAY_MS = 10_000;
export const SHOP_HIGHLIGHT_PER_PRODUCT_MS = PRODUCT_DISPLAY_MS;
/** After the full sequence, drawer stays hidden this long before repeating. */
export const SHOP_HIGHLIGHT_HIDDEN_GAP_MS = 8 * 60 * 1_000;
export const SHOP_HIGHLIGHT_REFRESH_MS = 60_000;
export const SHOP_HIGHLIGHT_CARD_HEIGHT_PX = 148;
export const SHOP_HIGHLIGHT_CONTENT_EXIT_MS = 280;
export const SHOP_HIGHLIGHT_CONTENT_ENTER_MS = 360;
export const SHOP_HIGHLIGHT_BREATH_MS = 3000;

type Phase = 'hidden' | 'sliding-out' | 'visible' | 'sliding-in';
type ContentPhase = 'settled' | 'exiting' | 'pre-enter' | 'entering';

/**
 * Drawer-style shop product card that slides out from behind the chat box.
 * Opens once, rotates products in place, then retracts for a long pause.
 */
export function ShopHighlightsOverlay() {
  const [items, setItems] = useState<ShopHighlight[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('hidden');
  const [contentPhase, setContentPhase] = useState<ContentPhase>('settled');
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const itemsRef = useRef<ShopHighlight[]>([]);
  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  itemsRef.current = items;
  indexRef.current = index;
  phaseRef.current = phase;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = (fn: () => void, ms: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current) fn();
    }, ms);
  };

  useEffect(() => {
    mountedRef.current = true;

    const motionQuery =
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const reducedMotionRef = { current: Boolean(motionQuery?.matches) };
    setReducedMotion(reducedMotionRef.current);
    const onMotionChange = () => {
      reducedMotionRef.current = Boolean(motionQuery?.matches);
      setReducedMotion(reducedMotionRef.current);
    };
    motionQuery?.addEventListener?.('change', onMotionChange);

    const url = getShopHighlightsUrl();
    if (!url) {
      console.warn(
        '[ShopHighlights] VITE_JIGADORES_SHOP_HIGHLIGHTS_URL is not set — shop drawer disabled.',
      );
      return () => {
        mountedRef.current = false;
        clearTimer();
        motionQuery?.removeEventListener?.('change', onMotionChange);
      };
    }

    let abort: AbortController | null = null;

    const exitMs = () =>
      reducedMotionRef.current ? 120 : SHOP_HIGHLIGHT_CONTENT_EXIT_MS;
    const enterMs = () =>
      reducedMotionRef.current ? 140 : SHOP_HIGHLIGHT_CONTENT_ENTER_MS;

    const beginProductHold = () => {
      setContentPhase('settled');
      schedule(() => onProductHoldComplete(), PRODUCT_DISPLAY_MS);
    };

    const onProductHoldComplete = () => {
      const decision = resolveShopProductAdvance(
        indexRef.current,
        itemsRef.current.length,
      );

      if (decision.type === 'retract') {
        beginSlideIn();
        return;
      }

      // Drawer stays open — only the product content transitions.
      setContentPhase('exiting');
      schedule(() => {
        setIndex(decision.nextIndex);
        indexRef.current = decision.nextIndex;
        setContentPhase('pre-enter');
        schedule(() => {
          setContentPhase('entering');
          schedule(() => beginProductHold(), enterMs());
        }, 16);
      }, exitMs());
    };

    const beginSlideOut = () => {
      if (!mountedRef.current || itemsRef.current.length === 0) return;
      setIndex(0);
      indexRef.current = 0;
      setContentPhase('settled');
      setPhase('sliding-out');
      phaseRef.current = 'sliding-out';
      schedule(() => {
        setPhase('visible');
        phaseRef.current = 'visible';
        beginProductHold();
      }, SHOP_HIGHLIGHT_SLIDE_MS);
    };

    const beginSlideIn = () => {
      if (!mountedRef.current) return;
      setContentPhase('settled');
      setPhase('sliding-in');
      phaseRef.current = 'sliding-in';
      schedule(() => {
        setPhase('hidden');
        phaseRef.current = 'hidden';
        setIndex(0);
        indexRef.current = 0;
        if (itemsRef.current.length === 0) return;
        schedule(() => beginSlideOut(), SHOP_HIGHLIGHT_HIDDEN_GAP_MS);
      }, SHOP_HIGHLIGHT_SLIDE_MS);
    };

    const load = async (startCycle: boolean) => {
      abort?.abort();
      abort = new AbortController();
      try {
        const next = await fetchShopHighlights(url, abort.signal);
        if (!mountedRef.current) return;

        setItems(next);
        itemsRef.current = next;

        if (next.length === 0) {
          clearTimer();
          setPhase('hidden');
          phaseRef.current = 'hidden';
          setIndex(0);
          indexRef.current = 0;
          setReady(false);
          return;
        }

        if (phaseRef.current === 'visible' || phaseRef.current === 'sliding-out') {
          const safeIndex = Math.min(indexRef.current, next.length - 1);
          setIndex(safeIndex);
          indexRef.current = safeIndex;
        } else {
          setIndex(0);
          indexRef.current = 0;
        }

        setReady(true);
        if (phaseRef.current === 'hidden' && !timerRef.current) {
          schedule(
            () => beginSlideOut(),
            startCycle ? 400 : Math.min(1200, SHOP_HIGHLIGHT_HIDDEN_GAP_MS),
          );
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('[ShopHighlights] fetch failed', err);
      }
    };

    void load(true);
    const refreshId = setInterval(() => {
      void load(false);
    }, SHOP_HIGHLIGHT_REFRESH_MS);

    return () => {
      mountedRef.current = false;
      clearTimer();
      clearInterval(refreshId);
      abort?.abort();
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
    // Intentionally mount-only: cycle is driven by refs + timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || items.length === 0) {
    return null;
  }

  const item = items[clampShopHighlightIndex(index, items.length)];
  if (!item) return null;

  const revealed = phase === 'sliding-out' || phase === 'visible';
  const translateY = revealed ? '0%' : '-100%';
  const opacity = phase === 'hidden' ? 0 : 1;
  const breathEnabled = !reducedMotion && phase === 'visible';

  return (
    <div
      className="w-full pointer-events-none"
      aria-hidden
      style={{
        height: SHOP_HIGHLIGHT_CARD_HEIGHT_PX,
        overflow: 'visible',
      }}
    >
      <style>{`
        @keyframes shop-highlight-breath {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -1.5px, 0) scale(1.025); }
        }
        @keyframes shop-highlight-price-glow {
          0%, 100% { color: rgb(165 243 252); text-shadow: 0 0 10px rgba(34, 211, 238, 0.25); }
          50% { color: rgb(186 250 255); text-shadow: 0 0 14px rgba(34, 211, 238, 0.45); }
        }

        /* Outer: product swap only (never shares transform with breathing). */
        .shop-hl-transition {
          will-change: transform, opacity;
        }
        .shop-hl-transition.is-settled {
          transform: translate3d(0, 0, 0) scale(1);
          opacity: 1;
          transition: none;
        }
        .shop-hl-transition.is-exiting {
          transform: translate3d(-18px, 0, 0) scale(0.975);
          opacity: 0;
          transition:
            transform ${SHOP_HIGHLIGHT_CONTENT_EXIT_MS}ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity ${SHOP_HIGHLIGHT_CONTENT_EXIT_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .shop-hl-transition.is-pre-enter {
          transform: translate3d(18px, 0, 0) scale(0.975);
          opacity: 0;
          transition: none;
        }
        .shop-hl-transition.is-entering {
          transform: translate3d(0, 0, 0) scale(1);
          opacity: 1;
          transition:
            transform ${SHOP_HIGHLIGHT_CONTENT_ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity ${SHOP_HIGHLIGHT_CONTENT_ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .shop-hl-transition.is-reduced.is-exiting,
        .shop-hl-transition.is-reduced.is-pre-enter,
        .shop-hl-transition.is-reduced.is-entering {
          transform: translate3d(0, 0, 0);
        }
        .shop-hl-transition.is-reduced.is-exiting {
          opacity: 0;
          transition: opacity 120ms ease;
        }
        .shop-hl-transition.is-reduced.is-pre-enter {
          opacity: 0;
          transition: none;
        }
        .shop-hl-transition.is-reduced.is-entering {
          opacity: 1;
          transition: opacity 140ms ease;
        }

        /* Inner: breathing only — independent transform tree. */
        .shop-hl-breath {
          transform: translate3d(0, 0, 0);
        }
        .shop-hl-breath.is-active {
          animation: shop-highlight-breath ${SHOP_HIGHLIGHT_BREATH_MS}ms ease-in-out infinite;
          will-change: transform;
        }
        .shop-hl-breath.is-active .shop-hl-price {
          animation: shop-highlight-price-glow ${SHOP_HIGHLIGHT_BREATH_MS}ms ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .shop-hl-breath.is-active,
          .shop-hl-breath.is-active .shop-hl-price {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="w-full h-full"
        style={{
          transform: `translateY(${translateY})`,
          opacity,
          transition: `transform ${SHOP_HIGHLIGHT_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${Math.round(SHOP_HIGHLIGHT_SLIDE_MS * 0.55)}ms ease`,
          willChange: 'transform, opacity',
        }}
      >
        <ShopHighlightCard
          item={item}
          contentPhase={contentPhase}
          breathing={breathEnabled}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}

function ShopHighlightCard({
  item,
  contentPhase,
  breathing,
  reducedMotion,
}: {
  item: ShopHighlight;
  contentPhase: ContentPhase;
  breathing: boolean;
  reducedMotion: boolean;
}) {
  const glow = item.imageGlow
    ? 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.35))'
    : undefined;
  const shadow = item.imageShadow
    ? 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))'
    : undefined;
  const filter = [glow, shadow].filter(Boolean).join(' ') || undefined;

  const imageSizePx = 85;
  const transitionClass = [
    'shop-hl-transition',
    'w-fit',
    'mx-auto',
    reducedMotion ? 'is-reduced' : '',
    contentPhase === 'settled' ? 'is-settled' : '',
    contentPhase === 'exiting' ? 'is-exiting' : '',
    contentPhase === 'pre-enter' ? 'is-pre-enter' : '',
    contentPhase === 'entering' ? 'is-entering' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const breathClass = [
    'shop-hl-breath',
    'flex',
    'items-center',
    'gap-3',
    breathing ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col"
      style={{
        background: resolveShopCardBackground(item),
        border: '1px solid rgba(56, 189, 248, 0.28)',
        borderRadius: '16px',
        boxShadow:
          '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 18px rgba(56, 189, 248, 0.12)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.28)' }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300"
          style={{ textShadow: '0 0 12px rgba(34, 211, 238, 0.35)' }}
        >
          Shop
        </span>
        <span
          className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-200"
          style={{ textShadow: '0 0 10px rgba(34, 211, 238, 0.28)' }}
        >
          Jigadores.com
        </span>
      </div>

      <div className="flex-1 min-h-0 flex items-center px-3 py-2 overflow-hidden">
        <div className={transitionClass}>
          <div className={breathClass}>
            <div
              className="relative flex-shrink-0 overflow-visible"
              style={{
                width: imageSizePx,
                height: imageSizePx,
                background: 'transparent',
              }}
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{
                    transform: `translate(${item.imageOffsetX}px, ${item.imageOffsetY}px) scale(${item.imageScale})`,
                    transformOrigin: 'center center',
                    filter,
                  }}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white/25">
                  ?
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-[14px] font-black uppercase tracking-wide text-white truncate leading-tight">
                {item.name}
              </div>
              <div className="shop-hl-price mt-1 text-[15px] font-bold text-cyan-200 tabular-nums">
                {formatJigadoresPoints(item.pointsCost)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
