import { useRef, useEffect, useCallback, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// Carousel3D – Production-quality infinite 3D horizontal carousel
// ─────────────────────────────────────────────────────────────
//
// INFINITE LOOP LOGIC:
//   The item list is duplicated (A B C → A B C A B C). The track
//   scrolls continuously via requestAnimationFrame. When the offset
//   exceeds the width of the first set, it snaps back by exactly
//   that width — seamless to the viewer because the second set is
//   an identical copy.
//
// 3D TRANSFORMS:
//   On every frame we measure each card's horizontal center relative
//   to the container center. The normalized distance (−1 … 0 … +1)
//   drives rotateY, scale, translateZ, opacity, and blur — so the
//   center card is always largest / sharpest and side cards recede.
//
// ANIMATION SYSTEM:
//   Purely GPU-accelerated: translate3d + rotateY + scale. A single
//   rAF loop updates the track translateX and per-card transforms
//   in one pass, targeting 60 fps.
// ─────────────────────────────────────────────────────────────

export interface Carousel3DItem {
  id: string;
  render: () => ReactNode;
}

interface Carousel3DProps {
  items: Carousel3DItem[];
  /** Pixels per second the track moves (default 40) */
  speed?: number;
  /** Card width in px (default 110) */
  cardWidth?: number;
  /** Gap between cards in px (default 14) */
  gap?: number;
  /** Container height CSS value (default '200px') */
  height?: string;
  /** Unique prefix for CSS classes to avoid collisions */
  id?: string;
}

export function Carousel3D({
  items,
  speed = 40,
  cardWidth = 110,
  gap = 14,
  height = '200px',
  id = 'c3d',
}: Carousel3DProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Total width of one full set of items
  const step = cardWidth + gap;
  const singleSetWidth = items.length * step;

  // Duplicate for infinite loop
  const loopItems = items.length > 1 ? [...items, ...items] : items;

  // ─── Per-frame update ───
  const tick = useCallback(
    (now: number) => {
      if (!trackRef.current || !containerRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Delta time (ms → s)
      const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = now;

      // Advance offset when not paused
      if (!pausedRef.current && items.length > 1) {
        offsetRef.current += speed * dt;
        // Seamless wrap: snap back by exactly one set width
        if (offsetRef.current >= singleSetWidth) {
          offsetRef.current -= singleSetWidth;
        }
      }

      // Apply track translation (GPU-accelerated)
      trackRef.current.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;

      // Container center X in viewport coords
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerCenterX = containerRect.left + containerRect.width / 2;

      // Update each card's 3D transform based on distance from center
      const cards = trackRef.current.children;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement;
        const cardRect = card.getBoundingClientRect();
        const cardCenterX = cardRect.left + cardRect.width / 2;

        // Normalized distance: 0 = center, ±1 = one container-width away
        const halfWidth = containerRect.width / 2;
        const dist = (cardCenterX - containerCenterX) / halfWidth;
        const absDist = Math.min(Math.abs(dist), 1.6);

        // ── 3D parameters driven by distance ──
        const rotateY = dist * -30;                          // ±30° at edges
        const scale = 1.08 - absDist * 0.22;                 // 1.08 center → 0.73 far
        const translateZ = 50 - absDist * 70;                // +50px center → -20px far
        const opacity = 1 - absDist * 0.45;                  // 1 center → 0.28 far
        const blur = absDist * 2.2;                           // 0 center → 3.5px far
        const brightness = 1 - absDist * 0.25;               // subtle dimming

        card.style.transform =
          `translate3d(0, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
        card.style.opacity = `${Math.max(0.18, opacity)}`;
        card.style.filter =
          `blur(${blur}px) brightness(${brightness}) saturate(${1.05 - absDist * 0.15})`;
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [items.length, singleSetWidth, speed],
  );

  // ─── Start / stop rAF loop ───
  useEffect(() => {
    if (items.length === 0) return;
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, items.length]);

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
      {/* Minimal scoped CSS – only what Tailwind can't do */}
      <style>{`
        .${id}-wrap {
          perspective: 900px;
          perspective-origin: 50% 50%;
        }
        .${id}-card {
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
          backface-visibility: hidden;
          transition: box-shadow 0.25s ease;
        }
        /* Neon edge glow on hover */
        .${id}-card:hover {
          box-shadow:
            0 0 18px rgba(96, 165, 250, 0.45),
            0 0 40px rgba(96, 165, 250, 0.15),
            0 12px 28px rgba(0,0,0,0.6) !important;
        }
        /* Glossy shine sweep */
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
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        {/* Track – translated each frame by rAF */}
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
              {/* Glassmorphism inner glow layer */}
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background:
                    'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                }}
              />
              {/* Shine sweep layer */}
              <div
                className="absolute inset-0 pointer-events-none z-[2] overflow-hidden rounded-xl"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.13) 50%, transparent 65%)',
                    animation: `${id}Shine 6s ease-in-out infinite`,
                    animationDelay: `${(index % items.length) * -0.8}s`,
                  }}
                />
              </div>
              {/* Card content rendered by parent */}
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
