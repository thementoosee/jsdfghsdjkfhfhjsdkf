/**
 * Shared digital arena backdrop — approved navy/blue/violet depth.
 * Used by entries field and champion stage. Behind content only.
 */
export function ArenaAtmosphere({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <style>{`
        @keyframes btArenaDrift {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -6px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes btArenaDriftAlt {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(4px, 3px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bt-arena-drift, .bt-arena-drift-alt { animation: none !important; }
        }
      `}</style>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 95% 58% at 16% 20%, rgba(37, 99, 235, 0.18) 0%, transparent 64%),
            radial-gradient(ellipse 85% 52% at 90% 70%, rgba(91, 33, 182, 0.12) 0%, transparent 66%),
            radial-gradient(ellipse 60% 40% at 50% 45%, rgba(30, 58, 138, 0.1) 0%, transparent 70%),
            radial-gradient(ellipse 55% 38% at 40% 82%, rgba(30, 64, 175, 0.14) 0%, transparent 68%)
          `,
        }}
      />
      <div
        className={reduceMotion ? undefined : 'bt-arena-drift'}
        style={{
          position: 'absolute',
          inset: '-8%',
          opacity: 0.7,
          animation: reduceMotion ? 'none' : 'btArenaDrift 28s ease-in-out infinite',
          backgroundImage: `
            radial-gradient(1.5px 1.5px at 12% 18%, rgba(226,232,240,0.28), transparent),
            radial-gradient(1px 1px at 28% 42%, rgba(251,191,36,0.18), transparent),
            radial-gradient(1.5px 1.5px at 48% 14%, rgba(191,219,254,0.22), transparent),
            radial-gradient(1px 1px at 66% 36%, rgba(226,232,240,0.2), transparent),
            radial-gradient(1.5px 1.5px at 82% 22%, rgba(251,191,36,0.14), transparent),
            radial-gradient(1px 1px at 18% 72%, rgba(191,219,254,0.18), transparent),
            radial-gradient(1px 1px at 54% 64%, rgba(226,232,240,0.16), transparent),
            radial-gradient(1.5px 1.5px at 76% 78%, rgba(167,139,250,0.14), transparent),
            radial-gradient(1px 1px at 92% 58%, rgba(226,232,240,0.18), transparent),
            radial-gradient(1px 1px at 36% 88%, rgba(251,191,36,0.12), transparent)
          `,
        }}
      />
      <div
        className={reduceMotion ? undefined : 'bt-arena-drift-alt'}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.35,
          animation: reduceMotion ? 'none' : 'btArenaDriftAlt 36s ease-in-out infinite',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 288 520" preserveAspectRatio="none">
          <path
            d="M-10 120C60 90 110 160 160 130C210 100 250 150 300 120"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M-20 340C50 300 100 380 170 350C230 325 260 390 310 360"
            stroke="rgba(129,140,248,0.1)"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
