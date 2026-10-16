import { useEffect, useState } from 'react';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { AutoFitNumber } from './AutoFitNumber';
import type { BonusTournamentPlayer } from './types';

const AVATAR_SIZE = 136; // outer ring; photo area ~130px after padding
const TROPHY_SIZE = 182;
const CELEBRATION_MS = 3200;

/** Premium metallic trophy — custom SVG, not a library icon. */
function ChampionTrophy({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="relative z-[1]"
      aria-hidden
      style={{
        filter:
          'drop-shadow(0 10px 22px rgba(251,191,36,0.42)) drop-shadow(0 0 28px rgba(251,191,36,0.22))',
      }}
    >
      <defs>
        <linearGradient id="btStageCup" x1="28" y1="8" x2="92" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffbeb" />
          <stop offset="0.28" stopColor="#fde68a" />
          <stop offset="0.55" stopColor="#fbbf24" />
          <stop offset="0.82" stopColor="#d97706" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="btStageRim" x1="30" y1="10" x2="90" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffbeb" />
          <stop offset="0.5" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="btStageStem" x1="52" y1="72" x2="68" y2="98" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef3c7" />
          <stop offset="0.45" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="btStageBase" x1="34" y1="96" x2="86" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#d97706" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="btStageShine" x1="40" y1="14" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.55" stopColor="#fef3c7" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="btStageInner" cx="60" cy="36" r="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#78350f" stopOpacity="0.35" />
          <stop offset="1" stopColor="#92400e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Handles */}
      <path
        d="M28 22c-12 2-18 12-16 24 2 11 10 16 20 16"
        stroke="url(#btStageCup)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M92 22c12 2 18 12 16 24-2 11-10 16-20 16"
        stroke="url(#btStageCup)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M28 22c-12 2-18 12-16 24 2 11 10 16 20 16"
        stroke="#fffbeb"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />
      <path
        d="M92 22c12 2 18 12 16 24-2 11-10 16-20 16"
        stroke="#fffbeb"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />

      {/* Cup body — tapered bowl with depth bands */}
      <path
        d="M34 16h52l-4.5 48c-1.6 12-10.5 20-21.5 20s-19.9-8-21.5-20L34 16z"
        fill="url(#btStageCup)"
      />
      <path
        d="M38 22h44l-1.2 14H39.2L38 22z"
        fill="#92400e"
        opacity="0.18"
      />
      <path
        d="M39.5 40h41l-1.8 16H41.3L39.5 40z"
        fill="#78350f"
        opacity="0.16"
      />
      <path d="M40 20h40l-3 40c-1.2 9-7.8 14.5-17 14.5S41.2 69 40 60L40 20z" fill="url(#btStageInner)" />
      <path d="M42 18h12c0 18-2 32-7 42-4.5-10-6.5-24-5-42z" fill="url(#btStageShine)" />
      <path
        d="M70 22c2 14 1 28-2 40"
        stroke="#fffbeb"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.28"
      />

      {/* Rim */}
      <rect x="31" y="12" width="58" height="7" rx="3.5" fill="url(#btStageRim)" />
      <rect x="34" y="13.5" width="22" height="2.2" rx="1.1" fill="#fffbeb" opacity="0.55" />
      <ellipse cx="60" cy="15.5" rx="26" ry="2.2" fill="#fffbeb" opacity="0.2" />

      {/* Stem + knop */}
      <ellipse cx="60" cy="72" rx="10" ry="4.5" fill="url(#btStageStem)" />
      <ellipse cx="60" cy="71" rx="7" ry="2" fill="#fef3c7" opacity="0.45" />
      <path d="M53.5 74h13v17h-13z" fill="url(#btStageStem)" />
      <path d="M55 76h4v13h-4z" fill="#fffbeb" opacity="0.22" />
      <ellipse cx="60" cy="90" rx="8" ry="2.6" fill="url(#btStageStem)" />

      {/* Base — stepped plinth */}
      <path d="M44 94h32l3 5H41l3-5z" fill="url(#btStageBase)" />
      <path d="M38 99h44l5 8H33l5-8z" fill="url(#btStageBase)" />
      <ellipse cx="60" cy="108" rx="30" ry="5.8" fill="url(#btStageBase)" />
      <ellipse cx="60" cy="106.5" rx="24" ry="3.4" fill="#fef3c7" opacity="0.42" />
      <ellipse cx="50" cy="105.5" rx="9" ry="1.7" fill="#fffbeb" opacity="0.38" />
    </svg>
  );
}

/** Small gold crown perched above the avatar — does not cover the photo. */
function ChampionCrown({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        filter: 'drop-shadow(0 2px 6px rgba(251,191,36,0.45))',
      }}
    >
      <defs>
        <linearGradient id="btStageCrown" x1="8" y1="6" x2="56" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffbeb" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path
        d="M6 28L12 10l10 12L32 4l10 18 10-12 6 18H6z"
        fill="url(#btStageCrown)"
      />
      <rect x="8" y="28" width="48" height="7" rx="2" fill="url(#btStageCrown)" />
      <circle cx="12" cy="10" r="2.4" fill="#fef3c7" />
      <circle cx="32" cy="4" r="2.8" fill="#fffbeb" />
      <circle cx="52" cy="10" r="2.4" fill="#fef3c7" />
      <rect x="14" y="29.5" width="16" height="2" rx="1" fill="#fffbeb" opacity="0.5" />
    </svg>
  );
}

const PARTICLES = [
  { left: '16%', delay: 2.05, dur: 1.1, size: 2 },
  { left: '28%', delay: 2.2, dur: 1.0, size: 3 },
  { left: '42%', delay: 2.1, dur: 1.15, size: 2 },
  { left: '55%', delay: 2.35, dur: 0.95, size: 3 },
  { left: '68%', delay: 2.15, dur: 1.1, size: 2 },
  { left: '80%', delay: 2.3, dur: 1.0, size: 2 },
  { left: '50%', delay: 2.45, dur: 0.9, size: 3 },
];

/**
 * CHAMPION STAGE — consagração visual.
 * Sequência ~3s (avatar/name → crown → trophy + particles), depois estático.
 */
export function ChampionCelebration({ player }: { player: BonusTournamentPlayer }) {
  const [phase, setPhase] = useState<'enter' | 'static'>('enter');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setPhase('enter');
    setImgFailed(false);
    const t = window.setTimeout(() => setPhase('static'), CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [player.id]);

  const initials = player.displayName.slice(0, 2).toUpperCase();
  const enter = phase === 'enter';

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col items-center px-3">
      <style>{`
        @keyframes btStageHeroIn {
          from { opacity: 0; transform: translateY(12px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes btStageCrownIn {
          from { opacity: 0; transform: translateY(8px) scale(0.7); filter: brightness(1.8); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.06); filter: brightness(1.35); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        @keyframes btStageTrophyIn {
          from { opacity: 0; transform: scale(0.78) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes btStageTrophyBloom {
          0% { opacity: 0; transform: scale(0.6); }
          40% { opacity: 0.9; transform: scale(1.08); }
          100% { opacity: 0.5; transform: scale(1); }
        }
        @keyframes btStageTrophyShine {
          0% { transform: translateX(-130%) skewX(-14deg); opacity: 0; }
          25% { opacity: 0.65; }
          100% { transform: translateX(130%) skewX(-14deg); opacity: 0; }
        }
        @keyframes btStageParticle {
          0% { opacity: 0; transform: translateY(8px) scale(0.4); }
          25% { opacity: 0.95; }
          100% { opacity: 0; transform: translateY(-72px) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bt-stage-hero, .bt-stage-crown, .bt-stage-trophy, .bt-stage-bloom,
          .bt-stage-shine, .bt-stage-particle {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      {/* Approved arena atmosphere + localized gold glows for trophy/avatar */}
      <ArenaAtmosphere />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 70% 38% at 50% 28%, rgba(251,191,36,0.14) 0%, transparent 70%),
            radial-gradient(ellipse 78% 42% at 50% 72%, rgba(251,191,36,0.16) 0%, transparent 72%)
          `,
        }}
      />

      {enter && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-[2]" aria-hidden>
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="bt-stage-particle absolute rounded-full"
              style={{
                left: p.left,
                bottom: '16%',
                width: p.size,
                height: p.size,
                background: 'radial-gradient(circle, #fef3c7 0%, #fbbf24 55%, transparent 100%)',
                animation: `btStageParticle ${p.dur}s ease-out ${p.delay}s both`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 min-h-[8px]" style={{ maxHeight: 28 }} />

      <div className="relative z-[1] flex flex-col items-center justify-center w-full flex-shrink-0 flex-[2.2]">
        {/* Crown + Avatar stack */}
        <div
          className="bt-stage-hero relative flex flex-col items-center"
          style={{
            animation: enter
              ? 'btStageHeroIn 0.85s cubic-bezier(0.22, 1, 0.36, 1) both'
              : 'none',
          }}
        >
          <div
            className="bt-stage-crown relative z-[2]"
            style={{
              marginBottom: 6,
              animation: enter
                ? 'btStageCrownIn 0.75s cubic-bezier(0.22, 1, 0.36, 1) 1.05s both'
                : 'none',
              opacity: enter ? undefined : 1,
            }}
          >
            <ChampionCrown size={52} />
          </div>

          <div
            className="relative rounded-full flex-shrink-0"
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              padding: 3,
              background:
                'linear-gradient(145deg, rgba(254,243,199,0.95), rgba(251,191,36,0.55), rgba(180,83,9,0.7))',
              boxShadow:
                '0 0 0 3px rgba(251,191,36,0.22), 0 14px 36px rgba(0,0,0,0.45)',
            }}
          >
            <div
              className="w-full h-full rounded-full overflow-hidden"
              style={{ boxShadow: 'inset 0 0 0 1.5px rgba(15,23,42,0.85)' }}
            >
              {!imgFailed && player.avatarUrl ? (
                <img
                  src={player.avatarUrl}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center font-black"
                  style={{
                    background: '#0f172a',
                    color: '#fde68a',
                    fontSize: 42,
                  }}
                >
                  {initials}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nickname */}
        <div
          className="bt-stage-hero w-full mt-5 px-1"
          style={{
            animation: enter
              ? 'btStageHeroIn 0.85s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both'
              : 'none',
          }}
        >
          <AutoFitNumber
            value={player.displayName}
            maxFontSize={30}
            minFontSize={15}
            color="#ffffff"
            fontWeight={900}
            title={player.displayName}
          />
        </div>

        {/* Trophy */}
        <div
          className="bt-stage-trophy relative mt-7 flex items-center justify-center"
          style={{
            width: TROPHY_SIZE + 20,
            height: TROPHY_SIZE + 12,
            animation: enter
              ? 'btStageTrophyIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) 2s both'
              : 'none',
          }}
        >
          <div
            className="bt-stage-bloom absolute rounded-full pointer-events-none"
            aria-hidden
            style={{
              width: TROPHY_SIZE + 64,
              height: TROPHY_SIZE + 64,
              background:
                'radial-gradient(circle, rgba(251,191,36,0.32) 0%, rgba(251,191,36,0.1) 42%, transparent 70%)',
              animation: enter ? 'btStageTrophyBloom 1.05s ease-out 2s both' : 'none',
              opacity: enter ? undefined : 0.45,
            }}
          />
          <ChampionTrophy size={TROPHY_SIZE} />
          {enter && (
            <div
              className="absolute inset-0 z-[2] overflow-hidden pointer-events-none"
              style={{ borderRadius: 24 }}
            >
              <div
                className="bt-stage-shine absolute top-0 bottom-0 w-[35%]"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(254,243,199,0.55), transparent)',
                  animation: 'btStageTrophyShine 0.95s ease-out 2.25s both',
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[12px]" style={{ maxHeight: 40 }} />
    </div>
  );
}

/** Slim header for champion mode — title + CAMPEÃO only. */
export function ChampionHeader() {
  return (
    <div
      className="flex-shrink-0 text-center"
      style={{
        paddingLeft: 11,
        paddingRight: 11,
        paddingTop: 14,
        paddingBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'transparent',
      }}
    >
      <div className="font-black tracking-[0.16em]" style={{ color: '#fbbf24', fontSize: 9.5 }}>
        BONUS TOURNAMENT · DEMO
      </div>
      <div className="font-black tracking-wide text-white leading-none mt-1.5" style={{ fontSize: 18 }}>
        CAMPEÃO
      </div>
    </div>
  );
}
