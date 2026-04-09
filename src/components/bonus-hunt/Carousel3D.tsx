import { useRef, useEffect, useCallback, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// Carousel3D – Premium casino-style 3D step carousel
// ─────────────────────────────────────────────────────────────
//
// STEP MOTION (direct DOM – bypasses React batching):
//   The track position is controlled entirely via refs and
//   direct style mutation so that:
//     1. transition property is set on the DOM element
//     2. browser paints it (forced via getComputedStyle)
//     3. transform is updated → CSS transition animates smoothly
//   This two-phase approach guarantees the browser sees the
//   transition before the position changes.
//
// INFINITE LOOP:
//   Items tripled. When we pass the end of the middle set,
//   we disable transition, jump back to the equivalent card
//   in the first set, then re-enable transition.
//
// 3D TILT (INWARD-FACING):
//   rAF measures each card's distance from center and applies
//   rotateY ±35°, scale, translateZ, opacity, blur — so side
//   cards always angle toward the center card.
// ─────────────────────────────────────────────────────────────

export interface Carousel3DItem {
  id: string;
  render: () => ReactNode;
}

interface Carousel3DProps {
  items: Carousel3DItem[];
  cardWidth?: number;
  gap?: number;
  height?: string;
  id?: string;
  /** Seconds each card stays centered before stepping (default 3) */
  pauseDuration?: number;
  /** Seconds for the slide transition between cards (default 0.8) */
  slideDuration?: number;
}

export function Carousel3D({
  items,
  cardWidth = 110,
  gap = 14,
  height = '200px',
  id = 'c3d',
  pauseDuration = 3,
  slideDuration = 0.8,
}: Carousel3DProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const step = cardWidth + gap;
  const n = items.length;

  // Triple for infinite wrap
  const loopItems = n > 1 ? [...items, ...items, ...items] : items;

  // ─── Move the track to a given logical index ───
  // animate=true  → smooth CSS transition
  // animate=false → instant jump (for wrap-around reset)
  const moveTo = useCallback(
    (logicalIndex: number, animate: boolean) => {
      const track = trackRef.current;
      if (!track) return;

      // Cards start at the middle set (offset n) so we have
      // room to wrap in both directions
      const offset = (n + logicalIndex) * step;

      if (animate) {
        // Phase 1: apply transition
        track.style.transition = `transform ${slideDuration}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
        // Force browser to commit the transition property before
        // we change the transform (prevents batching into one frame)
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        getComputedStyle(track).transition;
        // Phase 2: change position → browser animates
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      } else {
        // Instant jump – no transition
        track.style.transition = 'none';
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
    },
    [n, step, slideDuration],
  );

  // ─── Step to next card ───
  const stepForward = useCallback(() => {
    if (n <= 1) return;

    indexRef.current += 1;
    moveTo(indexRef.current, true);

    // After animation completes, wrap if needed + schedule next
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (indexRef.current >= n) {
        // Silent reset to equivalent position in set 1
        indexRef.current = indexRef.current % n;
        moveTo(indexRef.current, false);
      }
      // Schedule next step
      if (!pausedRef.current) {
        scheduleNext();
      }
    }, slideDuration * 1000 + 50);
  }, [n, moveTo, slideDuration]);

  // ─── Schedule the next auto-step ───
  const scheduleNext = useCallback(() => {
    if (n <= 1) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) {
        stepForward();
      }
    }, pauseDuration * 1000);
  }, [n, pauseDuration, stepForward]);

  // ─── Initial position + start auto-play ───
  useEffect(() => {
    if (n <= 1) return;
    // Set initial position (no animation)
    indexRef.current = 0;
    moveTo(0, false);
    scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [n, moveTo, scheduleNext]);

  // ─── Per-frame 3D depth update ───
  const updateDepth = useCallback(() => {
    if (!trackRef.current || !containerRef.current) {
      rafRef.current = requestAnimationFrame(updateDepth);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const cards = trackRef.current.children;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;

      const halfWidth = containerRect.width / 2;
      const dist = (cardCenterX - containerCenterX) / halfWidth;
      const absDist = Math.min(Math.abs(dist), 1.5);

      // Cards tilt INWARD toward center (book-shelf / fan look)
      const rotateY = dist * -35;
      const scale = 1.06 - absDist * 0.16;
      const translateZ = 40 - absDist * 55;
      const opacity = 1 - absDist * 0.35;
      const blur = absDist * 1.4;
      const brightness = 1 - absDist * 0.2;

      card.style.transform =
        `translate3d(0, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.opacity = `${Math.max(0.25, opacity)}`;
      card.style.filter =
        `blur(${blur}px) brightness(${brightness}) saturate(${1.05 - absDist * 0.1})`;
    }

    rafRef.current = requestAnimationFrame(updateDepth);
  }, []);

  useEffect(() => {
    if (n === 0) return;
    rafRef.current = requestAnimationFrame(updateDepth);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateDepth, n]);

  // ─── Hover pause / resume ───
  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
    clearTimeout(timerRef.current);
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    scheduleNext();
  }, [scheduleNext]);

  if (n === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-[11px] font-bold text-white/60"
        style={{ height }}
      >
        No bonuses yet
      </div>
    );
  }

  return (
    <>
      <style>{`
        .${id}-wrap {
          perspective: 900px;
          perspective-origin: 50% 50%;
        }
        .${id}-card {
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
          backface-visibility: hidden;
          transition: box-shadow 0.3s ease;
        }
        .${id}-card:hover {
          box-shadow:
            0 0 18px rgba(96, 165, 250, 0.45),
            0 0 40px rgba(96, 165, 250, 0.15),
            0 12px 28px rgba(0,0,0,0.6) !important;
        }
        @keyframes ${id}Shine {
          0%, 100% { transform: translateX(-120%); }
          50%      { transform: translateX(120%); }
        }
      `}</style>

      <div
        ref={containerRef}
        className={`${id}-wrap relative overflow-hidden`}
        style={{
          height,
          maskImage:
            'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={trackRef}
          className="flex items-stretch h-full"
          style={{
            gap: `${gap}px`,
            paddingLeft: `calc(50% - ${cardWidth / 2}px)`,
            willChange: 'transform',
          }}
        >
          {loopItems.map((item, index) => (
            <div
              key={`${id}-${item.id}-${index}`}
              className={`${id}-card flex-shrink-0 rounded-xl relative overflow-hidden`}
              style={{
                width: `${cardWidth}px`,
                background: 'rgba(8, 12, 28, 0.8)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background:
                    'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
                }}
              />
              <div className="absolute inset-0 pointer-events-none z-[2] overflow-hidden rounded-xl">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.13) 50%, transparent 65%)',
                    animation: `${id}Shine 7s ease-in-out infinite`,
                    animationDelay: `${(index % n) * -1}s`,
                  }}
                />
              </div>
              <div className="relative z-[1] flex flex-col h-full">
                {item.render()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
