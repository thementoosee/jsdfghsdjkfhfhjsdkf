import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { SlotThumb } from './SlotThumb';
import { resolveCountdownDisplay } from './draw-countdown-display';
import {
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  countConfirmedSlots,
  type DrawParticipant,
  type DrawPublicSnapshot,
} from './draw-types';
import {
  SPOTLIGHT_FADE_END,
  SPOTLIGHT_LAND_END,
  SPOTLIGHT_ORBIT,
  SPOTLIGHT_SPIN_END,
  buildSpotlightSequence,
  easeSoftLand,
  pickSpotlightSatellites,
  spotlightIndexAtProgress,
} from './spotlight-draw';
import { TwitchAvatar } from './TwitchAvatar';

const W = MAIN_OVERLAY_SIDEBAR_WIDTH_PX;
const H = 720;

const GOLD = '#fbbf24';
const WHITE = '#f8fafc';
const MUTED = '#94a3b8';

/** Spotlight / awaiting-slot hero avatar (centered). */
const HERO_AVATAR = 118;
/** Secondary orbit avatars during spotlight spin. */
const SAT_AVATAR = 42;
/** Slightly smaller after confirmation lift (still large). */
const LIFT_AVATAR = 104;
/** How far the hero block rises when slot is confirmed (px). */
const CONFIRM_LIFT_PX = 86;
/**
 * Vertical nudge for the reveal avatar cluster only (not title / “Revelação”).
 * Keeps relative orbit/hero/name spacing; clears gap under the subtitle.
 */
const REVEAL_CLUSTER_NUDGE_Y = 30;
/** Matchup diagonal avatars (~20% smaller for slot emphasis). */
const DUEL_AVATAR = 56;
/** Slot thumb width under confirmed player. */
const SLOT_W = 116;
const SLOT_H = Math.round(SLOT_W * (153 / 112));
/** Matchup diagonal slot thumbs (~15% larger, same portrait ratio). */
const DUEL_SLOT_W = 104;
const DUEL_SLOT_H = Math.round(DUEL_SLOT_W * (153 / 112));
/** Horizontal slide distance for duel entrance (px). */
const DUEL_SLIDE_PX = 52;

/**
 * Draw ceremony for the Bonus Tournament SIDEBAR (288×720).
 * Visual refinement: larger presence, centered hero, slot-after-confirm lift.
 */
export function DrawSidebarOverlay({
  snapshot,
  decorPool,
  demoBadge = false,
  forceProgress,
  /** When true, fills parent — border/frame owned by BonusTournamentOverlay shell. */
  embedded = false,
}: {
  snapshot: DrawPublicSnapshot | null;
  decorPool?: DrawParticipant[];
  demoBadge?: boolean;
  forceProgress?: number;
  embedded?: boolean;
}) {
  const live = usePhaseProgress(snapshot);
  const progress =
    typeof forceProgress === 'number' ? Math.min(1, Math.max(0, forceProgress)) : live;
  const phase = snapshot?.phase ?? 'idle';
  const confirmed = countConfirmedSlots(snapshot?.result);

  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={
        embedded
          ? {
              width: '100%',
              height: '100%',
              fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
              color: WHITE,
              contain: 'layout paint style',
            }
          : {
              width: W,
              height: H,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(165deg, #0b1220 0%, #101a2e 45%, #0a1020 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
              fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
              color: WHITE,
              contain: 'layout paint style',
            }
      }
    >
      <style>{`
        @keyframes btSlotIn {
          0% { opacity: 0; transform: translateY(18px) scale(0.92); }
          55% { opacity: 1; transform: translateY(-3px) scale(1.03); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes btCelebratePulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.7; }
        }
      `}</style>
      <ArenaAtmosphere />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 95% 55% at 50% 42%, rgba(251,191,36,0.07) 0%, transparent 68%)',
        }}
      />

      {demoBadge && (
        <div
          className="absolute top-2 left-2 z-30 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider"
          style={{
            color: '#0f172a',
            background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            borderRadius: 3,
          }}
        >
          DEMO
        </div>
      )}

      {snapshot?.runStatus === 'paused' && phase !== 'idle' && (
        <div
          className="absolute top-2 right-2 z-30 px-1.5 py-0.5 text-[8px] font-black uppercase"
          style={{ color: MUTED, background: 'rgba(15,23,42,0.9)', borderRadius: 3 }}
        >
          Pausado
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full px-2 pt-2.5 pb-2">
        {/* Minimal header — hide on countdown for max number presence */}
        {phase !== 'countdown' && (
          <header className="text-center flex-shrink-0 mb-1">
            <div className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: GOLD }}>
              Bonus Tournament
            </div>
            {phase !== 'intro' && phase !== 'idle' && (
              <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: MUTED }}>
                {headerSubtitle(snapshot)}
              </div>
            )}
          </header>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          {!snapshot || phase === 'idle' ? (
            <IdleBody snapshot={snapshot} />
          ) : phase === 'intro' ? (
            <IntroBody snapshot={snapshot} progress={progress} />
          ) : phase === 'countdown' ? (
            <LiveCountdownBody snapshot={snapshot} forceProgress={forceProgress} />
          ) : phase === 'reveal_player' || phase === 'awaiting_slot' || phase === 'slot_confirmed' ? (
            <RevealBody snapshot={snapshot} progress={progress} decorPool={decorPool} />
          ) : phase === 'slots_ready' || phase === 'show_selected' ? (
            <SlotsReadyBody snapshot={snapshot} progress={progress} />
          ) : phase === 'reveal_match' ? (
            <MatchDuelBody snapshot={snapshot} progress={progress} />
          ) : (
            <MatchDuelBody
              snapshot={{
                ...snapshot,
                phase: 'reveal_match',
                revealedMatches: Math.max(snapshot.revealedMatches, 1),
              }}
              progress={1}
            />
          )}
        </div>

        {/* Countdown is full-bleed — no footer stats / titles */}
        {phase !== 'countdown' && (
          <footer className="flex-shrink-0 pt-1.5">
            <ProgressRail snapshot={snapshot} />
            <div className="text-center text-[7px] font-black uppercase tracking-wider mt-1" style={{ color: MUTED }}>
              Jogador {String(snapshot?.revealedPlayers ?? 0).padStart(2, '0')} / {DRAW_SLOT_COUNT}
              {' · '}
              Slots {String(confirmed).padStart(2, '0')} / {DRAW_SLOT_COUNT}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function headerSubtitle(snapshot: DrawPublicSnapshot | null): string {
  if (!snapshot) return 'Aguardando…';
  switch (snapshot.phase) {
    case 'intro':
      return 'Sorteio';
    case 'countdown':
      return 'Preparar';
    case 'reveal_player':
      return `Revelação ${String(snapshot.revealedPlayers).padStart(2, '0')}/${DRAW_SLOT_COUNT}`;
    case 'awaiting_slot':
      return 'Aguarda slot';
    case 'slot_confirmed':
      return 'Slot confirmada';
    case 'slots_ready':
      return 'Prontos';
    case 'reveal_match':
      return `Jogo ${String(snapshot.revealedMatches).padStart(2, '0')}/${DRAW_MATCH_COUNT}`;
    case 'show_bracket':
    case 'awaiting_advance':
      return 'Quartos definidos';
    default:
      return 'Sorteio';
  }
}

function IdleBody({ snapshot }: { snapshot: DrawPublicSnapshot | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-3">
      <div
        className="text-[13px] font-black uppercase tracking-[0.12em] leading-tight"
        style={{ color: WHITE }}
      >
        {snapshot?.tournamentName || 'Bonus Tournament'}
      </div>
      <div className="mt-5 text-3xl font-black tracking-wide" style={{ color: GOLD }}>
        SORTEIO
      </div>
      <div
        className="mt-4 h-px w-20"
        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
      />
      <p className="mt-5 text-[11px] font-semibold leading-snug px-2" style={{ color: MUTED }}>
        {snapshot?.result
          ? 'Resultado preparado · inicia a apresentação no painel'
          : 'Gera o sorteio no Manager para começar'}
      </p>
    </div>
  );
}

function IntroBody({ snapshot, progress }: { snapshot: DrawPublicSnapshot; progress: number }) {
  const enter = easeOutCubic(Math.min(1, progress / 0.35));
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-center px-3"
      style={{ opacity: enter, transform: `translateY(${(1 - enter) * 20}px)` }}
    >
      <div
        className="font-black uppercase tracking-[0.06em] leading-tight"
        style={{ color: WHITE, fontSize: fitTitle(snapshot.tournamentName) }}
      >
        {snapshot.tournamentName}
      </div>
      <div className="mt-6 text-2xl font-black tracking-[0.18em]" style={{ color: GOLD }}>
        SORTEIO
      </div>
      <div
        className="mt-5 h-px w-24"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          transform: `scaleX(${enter})`,
        }}
      />
      <p className="mt-6 text-[12px] font-semibold leading-relaxed px-1" style={{ color: MUTED }}>
        Preparar o sorteio dos quartos de final
      </p>
    </div>
  );
}

function LiveCountdownBody({
  snapshot,
  forceProgress,
}: {
  snapshot: DrawPublicSnapshot;
  forceProgress?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (snapshot.runStatus === 'paused') return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [snapshot.runStatus, snapshot.phaseStartedAt, snapshot.version, snapshot.eventId]);

  const resolved = resolveCountdownDisplay(snapshot, now);
  const progress =
    typeof forceProgress === 'number' ? Math.min(1, Math.max(0, forceProgress)) : resolved.progress;
  return <CountdownBody value={resolved.value} progress={progress} />;
}

function CountdownBody({ value, progress }: { value: number; progress: number }) {
  const pulse = 0.9 + easeOutCubic(Math.min(1, progress / 0.28)) * 0.1;
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      <div
        className="absolute rounded-full"
        style={{
          width: 168,
          height: 168,
          background: `radial-gradient(circle, rgba(251,191,36,${0.28 + (1 - progress) * 0.22}) 0%, transparent 70%)`,
        }}
      />
      <div
        className="relative font-black tabular-nums leading-none"
        style={{
          fontSize: 114,
          color: GOLD,
          transform: `scale(${pulse})`,
          textShadow: '0 0 32px rgba(251,191,36,0.42)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Orbit-cluster Y for the spotlight avatar center during spin (px from cluster top). */
const SPIN_AVATAR_CENTER_Y = 118;
/** Waiting stack half-height (avatar+name+number+badge) — fixed so slot mount doesn't reflow. */
const WAIT_STACK_HALF = 122;
/** Fallback cluster height before ResizeObserver measures (sidebar body ≈ 720 − chrome). */
const CLUSTER_H_FALLBACK = 520;

function RevealBody({
  snapshot,
  progress,
  decorPool,
}: {
  snapshot: DrawPublicSnapshot;
  progress: number;
  decorPool?: DrawParticipant[];
}) {
  const idx = Math.max(0, snapshot.revealedPlayers - 1);
  const winner = snapshot.result?.selected[idx];
  const selected = snapshot.result?.selected ?? [];
  const waiting = snapshot.phase === 'awaiting_slot';
  const confirming = snapshot.phase === 'slot_confirmed';
  const spinning = snapshot.phase === 'reveal_player';

  const p = spinning ? progress : confirming ? progress : 1;

  const clusterRef = useRef<HTMLDivElement>(null);
  const [clusterH, setClusterH] = useState(0);
  useLayoutEffect(() => {
    const el = clusterRef.current;
    if (!el) return;
    const measure = () => setClusterH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pool = useMemo(() => {
    const base = (decorPool?.length ? decorPool : selected).filter(Boolean);
    return base.length ? base : winner ? [winner] : [];
  }, [decorPool, selected, winner]);

  const sequence = useMemo(
    () => (winner ? buildSpotlightSequence(pool, winner) : []),
    [pool, winner],
  );

  const faceIdx = spinning
    ? spotlightIndexAtProgress(Math.min(p, SPOTLIGHT_SPIN_END), Math.max(1, sequence.length))
    : Math.max(0, sequence.length - 1);
  const centerFace =
    winner && spinning && p < SPOTLIGHT_SPIN_END
      ? (sequence[faceIdx] ?? winner)
      : winner;

  const showSats = Boolean(winner) && spinning && p < SPOTLIGHT_FADE_END;
  const satellites = useMemo(
    () =>
      showSats && centerFace ? pickSpotlightSatellites(pool, centerFace, 4) : [],
    [showSats, pool, centerFace],
  );

  if (!winner || !centerFace) return null;

  // Phase 2 — fade remaining orbit faces (~300ms at revealPlayerMs=3600).
  const fadeT =
    spinning && p >= SPOTLIGHT_SPIN_END
      ? Math.min(1, (p - SPOTLIGHT_SPIN_END) / (SPOTLIGHT_FADE_END - SPOTLIGHT_SPIN_END))
      : spinning
        ? 0
        : 1;
  const satOpacity = showSats ? Math.max(0, 1 - fadeT) : 0;

  // Phase 3 — soft glide from spin anchor → wait-stack center (~1100ms).
  const glideRaw =
    spinning && p >= SPOTLIGHT_FADE_END
      ? Math.min(1, (p - SPOTLIGHT_FADE_END) / (SPOTLIGHT_LAND_END - SPOTLIGHT_FADE_END))
      : spinning
        ? 0
        : 1;
  const glideT = easeSoftLand(glideRaw);
  const landSettled = !spinning || p >= SPOTLIGHT_LAND_END;

  const goldBoost = spinning
    ? p < SPOTLIGHT_SPIN_END
      ? 0.14 + (p / SPOTLIGHT_SPIN_END) * 0.06
      : 0.2 + Math.max(fadeT, glideT) * 0.22
    : confirming
      ? 0.22
      : 0.14;

  // Confirmation timeline (slotConfirmMs ≈ 2400ms → lift ~670ms linear):
  // 0–0.28 lift · wait collapses 0–0.16 · slot 0.10–0.48 · label 0.40–0.68
  const liftT = confirming ? Math.min(1, p / 0.28) : 0;
  const waitFade = confirming
    ? 1 - Math.min(1, p / 0.16)
    : spinning && p >= SPOTLIGHT_LAND_END
      ? easeOutCubic(Math.min(1, (p - SPOTLIGHT_LAND_END) / 0.1))
      : waiting
        ? 1
        : 0;
  const slotIn = confirming ? easeOutCubic(Math.min(1, Math.max(0, (p - 0.1) / 0.38))) : 0;
  const labelIn = confirming ? easeOutCubic(Math.min(1, Math.max(0, (p - 0.4) / 0.28))) : 0;

  const avatarSize = confirming
    ? HERO_AVATAR - (HERO_AVATAR - LIFT_AVATAR) * liftT
    : HERO_AVATAR;
  const nameSize = confirming ? 23 - 2 * liftT : 24;
  // Phase 4 — name meta after glide settles (existing reveal, slightly softer fade-in).
  const metaIn = landSettled
    ? spinning
      ? easeOutCubic(Math.min(1, (p - SPOTLIGHT_LAND_END) / 0.1))
      : 1
    : 0;
  const showHeroMeta = (waiting || confirming || metaIn > 0.01) && metaIn > 0.01;
  const showWaitBadge = waitFade > 0.01;

  const h = clusterH > 0 ? clusterH : CLUSTER_H_FALLBACK;
  const spinStackTop = SPIN_AVATAR_CENTER_Y - HERO_AVATAR / 2;
  const finalStackTop = h / 2 - WAIT_STACK_HALF;
  const stackTop = spinStackTop + (finalStackTop - spinStackTop) * glideT;
  const gliding = spinning && glideRaw > 0 && glideRaw < 1;

  // Name clears southern satellite while orbit is visible; settles as sats fade.
  const nameClearance = 14 + satOpacity * 74;

  return (
    <div className="flex-1 flex flex-col items-center min-h-0 relative overflow-hidden px-1">
      <div
        ref={clusterRef}
        className="relative w-full"
        style={{
          flex: 1,
          minHeight: 0,
          transform: `translateY(${REVEAL_CLUSTER_NUDGE_Y}px)`,
        }}
      >
        {showSats &&
          satellites.map((sat, i) => {
            const pos = SPOTLIGHT_ORBIT[i] ?? SPOTLIGHT_ORBIT[0]!;
            return (
              <div
                key={`${sat.twitchUserId}-sat-${i}`}
                className="absolute left-1/2 top-[118px] pointer-events-none"
                style={{
                  transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
                  opacity: satOpacity * 0.88,
                  zIndex: 2,
                  transition: 'none',
                }}
              >
                <TwitchAvatar
                  url={sat.avatarUrl}
                  name={sat.displayName}
                  size={SAT_AVATAR}
                  border="2px solid rgba(148,163,184,0.45)"
                  boxShadow="0 4px 12px rgba(0,0,0,0.35)"
                  draggable={false}
                />
              </div>
            );
          })}

        {/* Single continuous hero — absolute FLIP from spin anchor → wait center (no layout teleport). */}
        <div
          className="z-10 flex flex-col items-center"
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 260,
            transform: `translate(-50%, ${stackTop - CONFIRM_LIFT_PX * liftT}px)`,
            // No CSS transition — lift is driven by phase progress RAF (original behaviour).
            willChange: gliding || confirming ? 'transform' : undefined,
          }}
        >
          <div className="relative flex-shrink-0">
            <div
              className="absolute inset-[-18px] rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, rgba(251,191,36,${0.18 + goldBoost * 0.55}) 0%, transparent 70%)`,
              }}
            />
            <TwitchAvatar
              url={centerFace.avatarUrl}
              name={centerFace.displayName}
              size={avatarSize}
              className="relative"
              border={`3px solid ${GOLD}`}
              boxShadow={`0 0 0 5px rgba(251,191,36,${goldBoost}), 0 14px 32px rgba(0,0,0,0.45)`}
              draggable={false}
            />
          </div>
          <FitName
            name={centerFace.displayName}
            maxPx={nameSize}
            minPx={13}
            className="max-w-[248px] text-center font-black px-1 flex-shrink-0"
            style={{
              color: WHITE,
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
              marginTop: nameClearance,
            }}
          />
          {showHeroMeta && (
            <div
              className="mt-1.5 text-[12px] font-black uppercase tracking-[0.22em] flex-shrink-0"
              style={{ color: GOLD, opacity: metaIn }}
            >
              {String(snapshot.revealedPlayers).padStart(2, '0')} / {DRAW_SLOT_COUNT}
            </div>
          )}

          {(showWaitBadge || confirming) && (
            <div
              className="px-3 text-[10px] font-black uppercase tracking-[0.12em] text-center flex-shrink-0 overflow-hidden"
              style={{
                color: GOLD,
                border: waitFade > 0.05 ? '1px solid rgba(251,191,36,0.5)' : '1px solid transparent',
                borderRadius: 8,
                background: waitFade > 0.05 ? 'rgba(251,191,36,0.12)' : 'transparent',
                boxShadow: waitFade > 0.05 ? '0 0 20px rgba(251,191,36,0.12)' : 'none',
                opacity: waitFade,
                maxHeight: 8 + waitFade * 36,
                marginTop: waitFade * 20,
                paddingTop: waitFade * 8,
                paddingBottom: waitFade * 8,
              }}
            >
              Aguarda escolha de slot
            </div>
          )}

          {confirming && winner.slot && (
            <div
              className="flex flex-col items-center mt-4 px-1 flex-shrink-0"
              style={{
                opacity: slotIn,
                transform: `translateY(${(1 - slotIn) * 14}px)`,
              }}
            >
              <div
                className="overflow-hidden rounded-lg flex-shrink-0"
                style={{
                  width: SLOT_W,
                  height: SLOT_H,
                  border: `2.5px solid ${GOLD}`,
                  boxShadow: '0 0 22px rgba(251,191,36,0.35), 0 10px 24px rgba(0,0,0,0.4)',
                }}
              >
                <SlotThumb
                  src={winner.slot.slotImage}
                  alt={winner.slot.slotName}
                  className="block w-full h-full object-cover object-center"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <div
                className="mt-2.5 text-[13px] font-black text-center leading-tight px-2"
                style={{ color: WHITE, maxWidth: 250 }}
                title={winner.slot.slotName}
              >
                {winner.slot.slotName}
              </div>
              <div
                className="mt-2 text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: GOLD, opacity: labelIn }}
              >
                Slot confirmada
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotsReadyBody({
  snapshot,
  progress,
}: {
  snapshot: DrawPublicSnapshot;
  progress: number;
}) {
  const enter = easeOutCubic(Math.max(progress, 0.85));
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-center px-2 relative"
      style={{ opacity: enter }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(251,191,36,0.14) 0%, transparent 70%)',
          animation: 'btCelebratePulse 3.2s ease-in-out infinite',
        }}
      />
      <div className="relative z-[1] text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>
        Bonus Tournament
      </div>
      <div className="relative z-[1] mt-2 text-[20px] font-black uppercase tracking-wide" style={{ color: WHITE }}>
        {DRAW_SLOT_COUNT} Jogadores
      </div>
      <div className="relative z-[1] mt-1 text-2xl font-black tabular-nums" style={{ color: GOLD }}>
        {DRAW_SLOT_COUNT} / {DRAW_SLOT_COUNT}
      </div>
      <div
        className="relative z-[1] mt-2 text-[10px] font-black uppercase tracking-[0.16em]"
        style={{ color: MUTED }}
      >
        Todas as slots confirmadas
      </div>
      <div
        className="relative z-[1] mx-auto mt-3 h-px w-28"
        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
      />
      <div className="relative z-[1] mt-4 grid grid-cols-4 gap-2 w-full px-1">
        {(snapshot.result?.selected ?? []).slice(0, DRAW_SLOT_COUNT).map((p, i) => {
          const cellIn = easeOutCubic(Math.min(1, Math.max(0, (Math.max(progress, 0.5) - i * 0.02) / 0.25)));
          return (
            <div key={p.twitchUserId} className="flex flex-col items-center gap-0.5" style={{ opacity: cellIn }}>
              <TwitchAvatar
                url={p.avatarUrl}
                name={p.displayName}
                size={52}
                border={`2px solid ${GOLD}`}
                boxShadow="0 0 10px rgba(251,191,36,0.2)"
                draggable={false}
              />
              <div
                className="text-[7px] font-bold truncate w-full text-center leading-tight"
                style={{ color: MUTED }}
                title={p.displayName}
              >
                {p.displayName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchDuelBody({
  snapshot,
  progress,
}: {
  snapshot: DrawPublicSnapshot;
  progress: number;
}) {
  const matchIdx = Math.max(0, (snapshot.revealedMatches || 1) - 1);
  const match = snapshot.result?.matchups[matchIdx];
  if (!match) return null;

  /**
   * Same revealMatchMs window (~7s) — only visual order redistributed:
   * 0.08–0.30 Moment 1: Player A full set slides from left
   * 0.30–0.42 Moment 2: VS fade + scale at center
   * 0.40–0.60 Moment 3: Player B full set slides from right
   * 0.60–1.00 Hold (complete diagonal)
   */
  const aIn = easeOutCubic(Math.min(1, Math.max(0, (progress - 0.08) / 0.22)));
  const vsIn = easeOutCubic(Math.min(1, Math.max(0, (progress - 0.3) / 0.12)));
  const bIn = easeOutCubic(Math.min(1, Math.max(0, (progress - 0.4) / 0.2)));

  return (
    <div className="flex-1 flex flex-col min-h-0 px-1.5">
      <div className="text-center flex-shrink-0 pt-1">
        <div className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: GOLD }}>
          Quartos de Final
        </div>
        <div className="text-[12px] font-black uppercase tracking-wider mt-1" style={{ color: MUTED }}>
          Jogo {String(match.index + 1).padStart(2, '0')} / {String(DRAW_MATCH_COUNT).padStart(2, '0')}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 mt-1 mb-0.5">
        {/* Player A — top-left */}
        <div
          className="absolute top-2 left-0 z-[2]"
          style={{
            opacity: aIn,
            transform: `translateX(${(1 - aIn) * -DUEL_SLIDE_PX}px)`,
            willChange: aIn < 1 ? 'transform, opacity' : undefined,
          }}
        >
          <DiagonalDuelSide player={match.playerA} mirror={false} />
        </div>

        {/* VS — optical center */}
        <div
          className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none"
          style={{
            opacity: vsIn,
            transform: `scale(${0.82 + vsIn * 0.18})`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="h-px w-9"
              style={{
                background: `linear-gradient(90deg, transparent, ${GOLD})`,
                opacity: 0.55 + vsIn * 0.45,
              }}
            />
            <span
              className="font-black"
              style={{
                fontSize: 34,
                color: GOLD,
                textShadow: '0 0 22px rgba(251,191,36,0.55)',
                lineHeight: 1,
                letterSpacing: '0.04em',
              }}
            >
              VS
            </span>
            <div
              className="h-px w-9"
              style={{
                background: `linear-gradient(90deg, ${GOLD}, transparent)`,
                opacity: 0.55 + vsIn * 0.45,
              }}
            />
          </div>
        </div>

        {/* Player B — bottom-right */}
        <div
          className="absolute bottom-2 right-0 z-[2]"
          style={{
            opacity: bIn,
            transform: `translateX(${(1 - bIn) * DUEL_SLIDE_PX}px)`,
            willChange: bIn < 1 ? 'transform, opacity' : undefined,
          }}
        >
          <DiagonalDuelSide player={match.playerB} mirror />
        </div>
      </div>
    </div>
  );
}

/** Diagonal duel side: A = left-aligned top; B = right-aligned bottom (mirrored). */
function DiagonalDuelSide({
  player,
  mirror,
}: {
  player: DrawParticipant;
  mirror: boolean;
}) {
  const align = mirror ? 'items-end' : 'items-start';
  const row = mirror ? 'flex-row-reverse' : 'flex-row';
  const textAlign = mirror ? 'text-right' : 'text-left';
  const namePad = mirror ? 'pr-0 pl-1.5' : 'pl-0 pr-1.5';

  return (
    <div className={`flex flex-col ${align} gap-2`} style={{ maxWidth: 268 }}>
      <div className={`flex ${row} items-center gap-1.5`}>
        <TwitchAvatar
          url={player.avatarUrl}
          name={player.displayName}
          size={DUEL_AVATAR}
          border={`2.5px solid ${GOLD}`}
          boxShadow="0 8px 18px rgba(0,0,0,0.4)"
          draggable={false}
        />
        <FitName
          name={player.displayName}
          maxPx={13}
          minPx={9}
          className={`font-black leading-tight ${textAlign} ${namePad}`}
          style={{ color: WHITE, maxWidth: 180 }}
        />
      </div>

      {player.slot ? (
        <div className={`flex ${row} items-center gap-1.5`}>
          <div
            className="overflow-hidden rounded-md flex-shrink-0"
            style={{
              width: DUEL_SLOT_W,
              height: DUEL_SLOT_H,
              border: '2px solid rgba(251,191,36,0.55)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            }}
          >
            <SlotThumb
              src={player.slot.slotImage}
              alt={player.slot.slotName}
              className="block w-full h-full object-cover object-center"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div
            className={`text-[10px] font-bold leading-tight ${textAlign} ${namePad} line-clamp-3`}
            style={{ color: MUTED, maxWidth: 136 }}
            title={player.slot.slotName}
          >
            {player.slot.slotName}
          </div>
        </div>
      ) : (
        <div
          className="rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{
            width: DUEL_SLOT_W,
            height: DUEL_SLOT_H,
            background: 'rgba(15,23,42,0.6)',
            border: '1px dashed rgba(148,163,184,0.3)',
            color: MUTED,
          }}
        >
          ?
        </div>
      )}
    </div>
  );
}

function ProgressRail({ snapshot }: { snapshot: DrawPublicSnapshot | null }) {
  const revealed = snapshot?.revealedPlayers ?? 0;
  const selected = snapshot?.result?.selected ?? [];
  return (
    <div className="w-full grid grid-cols-4 gap-0.5 px-0.5">
      {Array.from({ length: DRAW_SLOT_COUNT }, (_, i) => {
        const hasSlot = !!selected[i]?.slot?.slotId;
        const revealedOnly = i < revealed && !hasSlot;
        return (
          <div
            key={i}
            className="rounded-sm"
            style={{
              height: 3,
              background: hasSlot
                ? GOLD
                : revealedOnly
                  ? 'rgba(251,191,36,0.4)'
                  : 'rgba(148,163,184,0.18)',
            }}
            title={hasSlot ? 'Slot confirmada' : revealedOnly ? 'Revelado' : 'Pendente'}
          />
        );
      })}
    </div>
  );
}

function FitName({
  name,
  maxPx,
  minPx,
  className,
  style,
}: {
  name: string;
  maxPx: number;
  minPx: number;
  className?: string;
  style?: CSSProperties;
}) {
  const len = name.length;
  const size =
    len <= 8 ? maxPx : len <= 12 ? maxPx * 0.88 : len <= 16 ? maxPx * 0.72 : Math.max(minPx, maxPx * 0.55);
  return (
    <div className={className} style={{ ...style, fontSize: size }} title={name}>
      {name}
    </div>
  );
}

function fitTitle(name: string): number {
  const len = name.length;
  if (len <= 10) return 26;
  if (len <= 16) return 22;
  if (len <= 22) return 18;
  return 15;
}

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Phase-local 0→1 clock for timed ceremony steps.
 * IMPORTANT: `awaiting_slot` must stay at 0 — if it were 1, the first paint of
 * `slot_confirmed` would inherit progress=1 and skip the avatar lift / slot reveal.
 */
export function initialPhaseProgress(
  snapshot: Pick<DrawPublicSnapshot, 'phase' | 'phaseStartedAt' | 'phaseDurationMs'> | null,
  nowMs = Date.now(),
): number {
  if (!snapshot) return 0;
  if (!snapshot.phaseStartedAt || !snapshot.phaseDurationMs || snapshot.phaseDurationMs <= 0) {
    return snapshot.phase === 'awaiting_slot' || snapshot.phase === 'idle' ? 0 : 1;
  }
  const started = new Date(snapshot.phaseStartedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.min(1, Math.max(0, (nowMs - started) / snapshot.phaseDurationMs));
}

function usePhaseProgress(snapshot: DrawPublicSnapshot | null): number {
  const [progress, setProgress] = useState(() => initialPhaseProgress(snapshot));

  useLayoutEffect(() => {
    if (!snapshot?.phaseStartedAt || !snapshot.phaseDurationMs || snapshot.phaseDurationMs <= 0) {
      setProgress(initialPhaseProgress(snapshot));
      return;
    }
    const started = new Date(snapshot.phaseStartedAt).getTime();
    const duration = snapshot.phaseDurationMs;
    const compute = () => Math.min(1, Math.max(0, (Date.now() - started) / duration));

    // Synchronous reset so slot_confirmed never paints one frame at progress=1.
    setProgress(compute());

    if (snapshot.runStatus === 'paused') {
      return;
    }

    let raf = 0;
    const tick = () => {
      const p = compute();
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    snapshot?.phase,
    snapshot?.phaseStartedAt,
    snapshot?.phaseDurationMs,
    snapshot?.runStatus,
    snapshot?.version,
    snapshot?.revealedPlayers,
    snapshot?.revealedMatches,
    snapshot?.eventId,
  ]);

  return progress;
}
