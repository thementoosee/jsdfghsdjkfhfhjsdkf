import { useRef, useEffect, useCallback, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// Carousel3D – Smooth step-by-step conveyor carousel
// ─────────────────────────────────────────────────────────────
//
// The WHOLE track (all cards together) slides left via a CSS
// transition on the track's transform. Individual cards never
// change position — they ride with the track. The 3D depth
// effects (tilt, scale, opacity) are applied to a WRAPPER div
// around each card so they don't interfere with the track's
// sliding transform.
//
// Reflow is forced with `void track.offsetHeight` (synchronous
// layout flush) — the most reliable cross-browser method to
// guarantee the browser commits one style change before seeing
// the next. The `transitionend` event detects completion.
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
  pauseDuration?: number;
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
  const depthRafRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const aliveRef = useRef(true);

  const step = cardWidth + gap;
  const n = items.length;
  const loopItems = n > 1 ? [...items, ...items, ...items] : items;

  // ─── px offset for a logical index (middle set starts at n) ───
  const offsetFor = useCallback(
    (idx: number) => (n + idx) * step,
    [n, step],
  );

  // ─── Schedule the next step after a pause ───
  const scheduleNext = useCallback(() => {
    if (n <= 1 || !aliveRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pausedRef.current || !aliveRef.current) return;
      doStep();
    }, pauseDuration * 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, pauseDuration]);

  // ─── Perform one animated step ───
  const doStep = useCallback(() => {
    const track = trackRef.current;
    if (!track || n <= 1 || !aliveRef.current) return;

    indexRef.current += 1;
    const offset = offsetFor(indexRef.current);

    // One-shot transitionend listener — fires when the slide finishes
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'transform') return;
      track.removeEventListener('transitionend', onEnd);

      if (!aliveRef.current) return;

      // Wrap around if we've gone past the original set
      if (indexRef.current >= n) {
        indexRef.current = indexRef.current % n;
        const resetOffset = offsetFor(indexRef.current);

        // Instant jump — no transition
        track.style.transition = 'none';
        track.style.transform = `translate3d(${-resetOffset}px, 0, 0)`;
        // Force synchronous reflow so the browser actually paints
        // the jump BEFORE any future transition is applied
        void track.offsetHeight;
      }

      if (!pausedRef.current) {
        scheduleNext();
      }
    };

    track.addEventListener('transitionend', onEnd);

    // Step 1: Set the transition rule (no transform change yet)
    track.style.transition =
      `transform ${slideDuration}s cubic-bezier(0.25, 0.1, 0.25, 1)`;

    // Force the browser to commit the transition property
    void track.offsetHeight;

    // Step 2: NOW change the transform → browser animates smoothly
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  }, [n, offsetFor, slideDuration, scheduleNext]);

  // ─── Mount: set initial position + start ───
  useEffect(() => {
    const track = trackRef.current;
    if (!track || n <= 1) return;

    aliveRef.current = true;
    indexRef.current = 0;

    // Set initial position without transition
    track.style.transition = 'none';
    track.style.transform = `translate3d(${-offsetFor(0)}px, 0, 0)`;
    void track.offsetHeight;

    scheduleNext();

    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [n, offsetFor, scheduleNext]);

  // ─── Per-frame 3D depth on wrapper divs ───
  const updateDepth = useCallback(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) {
      depthRafRef.current = requestAnimationFrame(updateDepth);
      return;
    }

    const cRect = container.getBoundingClientRect();
    const cx = cRect.left + cRect.width / 2;
    const hw = cRect.width / 2;

    // Each child of the track is a depth-wrapper div that contains the card
    for (let i = 0; i < track.children.length; i++) {
      const wrapper = track.children[i] as HTMLElement;
      const wRect = wrapper.getBoundingClientRect();
      const wcx = wRect.left + wRect.width / 2;

      const dist = (wcx - cx) / hw;
      const absDist = Math.min(Math.abs(dist), 1.5);

      const rotateY = dist * -35;
      const scale = 1.06 - absDist * 0.16;
      const translateZ = 40 - absDist * 55;
      const opacity = 1 - absDist * 0.35;
      const blur = absDist * 1.4;
      const brightness = 1 - absDist * 0.2;

      wrapper.style.transform =
        `translate3d(0,0,${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      wrapper.style.opacity = `${Math.max(0.25, opacity)}`;
      wrapper.style.filter =
        `blur(${blur}px) brightness(${brightness}) saturate(${1.05 - absDist * 0.1})`;
    }

    depthRafRef.current = requestAnimationFrame(updateDepth);
  }, []);

  useEffect(() => {
    if (n === 0) return;
    depthRafRef.current = requestAnimationFrame(updateDepth);
    return () => cancelAnimationFrame(depthRafRef.current);
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
        .${id}-depth {
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
          backface-visibility: hidden;
        }
        .${id}-card {
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
        {/* Track – the ONLY element that slides via CSS transition */}
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
            /* Depth wrapper — 3D tilt/scale/opacity applied here by rAF.
               This div does NOT have its own transition, so the rAF
               updates don't fight the track's slide transition. */
            <div
              key={`${id}-${item.id}-${index}`}
              className={`${id}-depth flex-shrink-0`}
              style={{ width: `${cardWidth}px` }}
            >
              <div
                className={`${id}-card w-full h-full rounded-xl relative overflow-hidden`}
                style={{
                  background: 'rgba(8, 12, 28, 0.8)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
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
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
