import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// Carousel3D – Premium casino-style 3D step carousel
// ─────────────────────────────────────────────────────────────
//
// STEP MOTION:
//   Instead of continuous linear scroll, the carousel holds on
//   each card for a dwell period (pauseDuration), then eases to
//   the next card with a smooth cubic-bezier transition. This
//   lets viewers read slot names, bets, and payouts clearly.
//
// INFINITE LOOP:
//   Items tripled (A B C → A B C A B C A B C). The logical
//   index wraps modulo items.length. When the transition ends
//   past the first set boundary, we instantly (no transition)
//   jump back to the equivalent position in the first set —
//   invisible because the rendered cards are identical.
//
// 3D TILT (INWARD-FACING):
//   Cards tilt *toward* the center card — left cards rotateY
//   positive (right edge recedes), right cards rotateY negative
//   (left edge recedes). This creates the "book shelf" /
//   "fan" look from the reference image. The center card is
//   flat (0°), full scale, full brightness.
//
// ANIMATION:
//   All transforms are GPU-accelerated (translate3d, rotateY,
//   scale). Per-card depth is applied via rAF measuring each
//   card's distance from container center every frame, so the
//   3D effect stays perfectly synced during transitions.
// ─────────────────────────────────────────────────────────────

export interface Carousel3DItem {
  id: string;
  render: () => ReactNode;
}

interface Carousel3DProps {
  items: Carousel3DItem[];
  /** Card width in px (default 110) */
  cardWidth?: number;
  /** Gap between cards in px (default 14) */
  gap?: number;
  /** Container height CSS value (default '200px') */
  height?: string;
  /** Unique prefix for CSS classes to avoid collisions */
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

  // Step state – logical index into the items array
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const step = cardWidth + gap;

  // Triple the items for seamless infinite wrap
  const loopItems = items.length > 1
    ? [...items, ...items, ...items]
    : items;

  // Offset: center the currentIndex-th card. We start from the
  // second set (items.length) so we have room to wrap both ways.
  const baseIndex = items.length + currentIndex;
  const targetOffset = baseIndex * step;

  // ─── Schedule next step ───
  const scheduleNext = useCallback(() => {
    if (items.length <= 1) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (pausedRef.current) {
        return;
      }
      setIsAnimating(true);
      setCurrentIndex(prev => prev + 1);
    }, pauseDuration * 1000);
  }, [items.length, pauseDuration]);

  // When currentIndex changes, handle wrap-around and schedule next
  useEffect(() => {
    if (items.length <= 1) return;

    // After transition completes, check if we need to wrap
    const delay = isAnimating ? slideDuration * 1000 + 50 : 0;
    const wrapTimeout = setTimeout(() => {
      setIsAnimating(false);
      if (currentIndex >= items.length) {
        // Silently reset to equivalent position in first logical set
        setCurrentIndex(prev => prev % items.length);
      }
      if (!pausedRef.current) {
        scheduleNext();
      }
    }, delay);

    return () => clearTimeout(wrapTimeout);
  }, [currentIndex, items.length, slideDuration, scheduleNext, isAnimating]);

  // Initial schedule
  useEffect(() => {
    scheduleNext();
    return () => clearTimeout(timeoutRef.current);
  }, [scheduleNext]);

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

      // Normalized distance: 0 = center, ±1 = one container-width away
      const halfWidth = containerRect.width / 2;
      const dist = (cardCenterX - containerCenterX) / halfWidth;
      const absDist = Math.min(Math.abs(dist), 1.5);

      // ── Cards tilt INWARD toward center ──
      // Left cards (dist < 0): positive rotateY → right edge recedes, face turns right toward center
      // Right cards (dist > 0): negative rotateY → left edge recedes, face turns left toward center
      // This creates the "book shelf" / fan look from the reference image
      const rotateY = dist * -35;                             // ±35° at edges, inward-facing
      const scale = 1.06 - absDist * 0.16;                    // 1.06 center → ~0.82 far
      const translateZ = 40 - absDist * 55;                   // +40px center → -15px far
      const opacity = 1 - absDist * 0.35;                     // 1 center → 0.48 far
      const blur = absDist * 1.4;                              // 0 center → ~2px far (subtle)
      const brightness = 1 - absDist * 0.2;                    // subtle dimming at edges

      card.style.transform =
        `translate3d(0, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.opacity = `${Math.max(0.25, opacity)}`;
      card.style.filter =
        `blur(${blur}px) brightness(${brightness}) saturate(${1.05 - absDist * 0.1})`;
    }

    rafRef.current = requestAnimationFrame(updateDepth);
  }, []);

  // Start rAF depth loop
  useEffect(() => {
    if (items.length === 0) return;
    rafRef.current = requestAnimationFrame(updateDepth);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateDepth, items.length]);

  // ─── Hover pause / resume ───
  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
    clearTimeout(timeoutRef.current);
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    scheduleNext();
  }, [scheduleNext]);

  if (items.length === 0) {
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
      {/* Scoped CSS – only what Tailwind can't express */}
      <style>{`
        .${id}-wrap {
          perspective: 900px;
          perspective-origin: 50% 50%;
        }
        .${id}-track {
          will-change: transform;
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
        {/* Track – positioned by transform, animated with CSS transition */}
        <div
          ref={trackRef}
          className={`${id}-track flex items-stretch h-full`}
          style={{
            gap: `${gap}px`,
            paddingLeft: `calc(50% - ${cardWidth / 2}px)`,
            transform: `translate3d(${-targetOffset}px, 0, 0)`,
            transition: isAnimating
              ? `transform ${slideDuration}s cubic-bezier(0.25, 0.1, 0.25, 1)`
              : 'none',
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
              {/* Glassmorphism inner glow */}
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background:
                    'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
                }}
              />
              {/* Shine sweep */}
              <div className="absolute inset-0 pointer-events-none z-[2] overflow-hidden rounded-xl">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.13) 50%, transparent 65%)',
                    animation: `${id}Shine 7s ease-in-out infinite`,
                    animationDelay: `${(index % items.length) * -1}s`,
                  }}
                />
              </div>
              {/* Card content */}
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
