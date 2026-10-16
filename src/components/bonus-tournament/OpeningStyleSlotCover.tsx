import { SlotThumb } from './SlotThumb';

/**
 * Vertical “book cover” slot thumb matching Bonus Opening / Carousel3D chrome:
 * portrait frame, glass edge, depth shadow, glossy shine sweep.
 * Does not modify Opening — visual parity only; images still go through SlotThumb.
 *
 * Outer frame stays fixed. Inner image uses a subtle breathing microzoom (no translateY).
 */
export function OpeningStyleSlotCover({
  src,
  alt,
  width = 92,
  height = 126,
  shineId = 'bt-cover',
  fill = false,
}: {
  src: string;
  alt: string;
  /** Opening carousel uses ~88×120; keep that portrait ratio. */
  width?: number | string;
  height?: number | string;
  /** Unique CSS keyframe prefix when multiple covers share a page */
  shineId?: string;
  /** Fill parent box (parent owns size / aspect-ratio). */
  fill?: boolean;
}) {
  const anim = `${shineId}Shine`;
  const breath = `${shineId}Breath`;

  return (
    <>
      <style>{`
        @keyframes ${anim} {
          0%, 100% { transform: translateX(-120%); }
          50% { transform: translateX(120%); }
        }
        @keyframes ${breath} {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @media (prefers-reduced-motion: reduce) {
          .${shineId}-breath { animation: none !important; transform: none !important; }
          .${shineId}-shine { animation: none !important; }
        }
      `}</style>
      <div
        className={`relative rounded-xl overflow-hidden ${fill ? 'w-full h-full' : 'flex-shrink-0'}`}
        style={{
          ...(fill ? {} : { width, height }),
          background: 'rgba(8, 12, 28, 0.8)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow:
            '0 10px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(251,191,36,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <SlotThumb
          src={src}
          alt={alt}
          className={`${shineId}-breath absolute inset-0 w-full h-full object-cover`}
          style={{
            transformOrigin: 'center center',
            animation: `${breath} 4s ease-in-out infinite`,
            willChange: 'transform',
          }}
        />
        {/* Glassmorphism inner glow — same recipe as Carousel3D */}
        <div
          className="absolute inset-0 pointer-events-none rounded-xl z-[1]"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 42%)',
          }}
        />
        {/* Glossy shine sweep */}
        <div className="absolute inset-0 pointer-events-none z-[2] overflow-hidden rounded-xl">
          <div
            className={`${shineId}-shine absolute inset-0`}
            style={{
              background:
                'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.16) 50%, transparent 65%)',
              animation: `${anim} 6s ease-in-out infinite`,
            }}
          />
        </div>
      </div>
    </>
  );
}
