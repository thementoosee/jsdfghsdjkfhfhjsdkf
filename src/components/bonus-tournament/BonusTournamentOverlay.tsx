import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Swords } from 'lucide-react';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';
import { AutoFitNumber } from './AutoFitNumber';
import { ChampionCelebration, ChampionHeader } from './ChampionCelebration';
import { EntriesOverlay } from './EntriesOverlay';
import { DrawSidebarOverlay } from './DrawSidebarOverlay';
import { matchesForRound, playerMap } from './demo-data';
import { OpeningStyleSlotCover } from './OpeningStyleSlotCover';
import { calcMulti, calcSideStats, formatAvg, formatMoney, formatMulti, suggestWinner } from './scoring';
import { calcTournamentHudStats } from './tournament-stats';
import type { DrawPublicSnapshot } from './draw-types';
import type { BonusTournamentDemo, BonusTournamentMatch, BonusTournamentPlayer, BonusTournamentRound } from './types';
import { ROUND_LABEL } from './types';

const W = MAIN_OVERLAY_SIDEBAR_WIDTH_PX;
const H = 720;

const COVER_W = 112;
const COVER_H = 153;
const AVATAR_PX = 28;
/** Overlay content inset (header + overview). */
const PAD = 11;
/** Duel horizontal inset — keeps avatars + gold rings clear of the 288px edges (≥10–12px). */
const DUEL_PAD_X = 12;
/** Extra room around avatar so box-shadow rings are not clipped by zone overflow. */
const AVATAR_RING_PAD = 2;
const REVEAL_MS = 900;
const REVEAL_MID_MS = Math.round(REVEAL_MS * 0.48);

/** Soft scene crossfade (draw→duel, duel→duel, duel→champion). */
const FADE_OUT_MS = 450;
const FADE_GAP_MS = 100;
const FADE_IN_MS = 650;
/** Hold current duel with loser grayed before crossfading to next scene. */
const ELIM_HOLD_MS = 900;

type RevealPhase = 'pending' | 'revealing' | 'revealed';

interface BonusTournamentOverlayProps {
  demo: BonusTournamentDemo;
  view?: 'overview' | 'duel' | 'entries' | 'draw';
  /** Live draw ceremony snapshot (sidebar). When set with draw view/status, shows sorteio. */
  drawSnapshot?: DrawPublicSnapshot | null;
}

/** Champion screen only when FINAL is done and admin confirmed the winner. */
export function resolveTournamentChampion(
  demo: BonusTournamentDemo,
  players: Record<string, BonusTournamentPlayer>,
): BonusTournamentPlayer | null {
  if (demo.status !== 'completed') return null;
  const final = demo.matches.find((m) => m.round === 'final' && m.status === 'done' && m.confirmedWinnerId);
  if (!final?.confirmedWinnerId) return null;
  return players[final.confirmedWinnerId] ?? null;
}

/** Stable scene id — changes only on phase / match / champion swaps (not PAY edits). */
export function overlaySceneKey(
  demo: BonusTournamentDemo,
  view: BonusTournamentOverlayProps['view'],
  drawSnapshot: DrawPublicSnapshot | null | undefined,
): string {
  const players = playerMap(demo);
  const champion = resolveTournamentChampion(demo, players);
  if (champion) return `champ:${champion.id}`;

  const activeView = view ?? demo.overlayView;
  const drawCeremonyLive =
    drawSnapshot != null &&
    drawSnapshot.phase !== 'idle' &&
    drawSnapshot.phase !== 'intro' &&
    (drawSnapshot.runStatus === 'running' ||
      drawSnapshot.runStatus === 'paused' ||
      drawSnapshot.runStatus === 'completed');
  const isDrawPhase =
    drawCeremonyLive &&
    (activeView === 'draw' ||
      (demo.status === 'draw' &&
        activeView !== 'overview' &&
        activeView !== 'duel' &&
        activeView !== 'entries'));
  if (isDrawPhase) return 'draw';

  const isEntriesPhase =
    demo.status === 'entries' || demo.status === 'preparation' || demo.overlayView === 'entries';
  const viewName = String(activeView ?? '');
  const showEntries =
    viewName === 'entries' ||
    demo.status === 'entries' ||
    demo.status === 'preparation' ||
    (demo.status === 'draw' && (viewName === 'draw' || viewName === 'entries' || isEntriesPhase));
  if (showEntries) return 'entries';

  const selected = demo.matches.find((m) => m.id === demo.selectedMatchId) ?? null;
  if (selected) return `duel:${selected.id}`;
  return 'overview';
}

export function shouldOverlaySceneFade(fromKey: string, toKey: string): boolean {
  if (fromKey === toKey) return false;
  if (fromKey === 'draw' && toKey.startsWith('duel:')) return true;
  if (fromKey.startsWith('duel:') && toKey.startsWith('duel:')) return true;
  if (fromKey.startsWith('duel:') && toKey.startsWith('champ:')) return true;
  if (fromKey === 'overview' && toKey.startsWith('duel:')) return true;
  return false;
}

/**
 * Freeze the outgoing duel with the confirmed winner (from incoming demo)
 * so the overlay can gray the loser before fading to the next scene.
 * Does not delay persistence — visual only.
 */
export function buildElimHoldDemo(
  incoming: BonusTournamentDemo,
  fromSceneKey: string,
): BonusTournamentDemo | null {
  if (!fromSceneKey.startsWith('duel:')) return null;
  const matchId = fromSceneKey.slice('duel:'.length);
  const completed = incoming.matches.find((m) => m.id === matchId);
  if (!completed?.confirmedWinnerId) return null;
  return {
    ...incoming,
    // Keep duel UI (not champion) during the hold, even if status already completed.
    status: incoming.status === 'completed' ? 'final' : incoming.status,
    selectedMatchId: matchId,
    overlayView: 'duel',
  };
}

type PaintBundle = {
  demo: BonusTournamentDemo;
  view?: BonusTournamentOverlayProps['view'];
  drawSnapshot?: DrawPublicSnapshot | null;
  sceneKey: string;
};

export function BonusTournamentOverlay({ demo, view, drawSnapshot }: BonusTournamentOverlayProps) {
  const sceneKey = overlaySceneKey(demo, view, drawSnapshot);
  const [paint, setPaint] = useState<PaintBundle>(() => ({
    demo,
    view,
    drawSnapshot,
    sceneKey,
  }));
  const [opacity, setOpacity] = useState(1);
  const paintKeyRef = useRef(sceneKey);
  const bootRef = useRef(true);
  const fadeGen = useRef(0);
  const holdingRef = useRef(false);

  // Same scene (PAY / AVG / timer): update frozen paint without fade.
  // Skip while holding elim reveal so we don't jump to the next match early.
  useEffect(() => {
    if (holdingRef.current) return;
    if (sceneKey === paintKeyRef.current) {
      setPaint({ demo, view, drawSnapshot, sceneKey });
    }
  }, [demo, view, drawSnapshot, sceneKey]);

  // Scene change: elim hold (if duel) → fade-out → swap → fade-in.
  useEffect(() => {
    if (bootRef.current) {
      bootRef.current = false;
      paintKeyRef.current = sceneKey;
      setPaint({ demo, view, drawSnapshot, sceneKey });
      setOpacity(1);
      return;
    }
    if (sceneKey === paintKeyRef.current) return;

    const from = paintKeyRef.current;
    const to = sceneKey;
    if (!shouldOverlaySceneFade(from, to)) {
      paintKeyRef.current = to;
      holdingRef.current = false;
      setPaint({ demo, view, drawSnapshot, sceneKey: to });
      setOpacity(1);
      return;
    }

    const gen = ++fadeGen.current;
    let tHold = 0;
    let tOut = 0;
    let tGap = 0;

    const startFadeOut = () => {
      if (fadeGen.current !== gen) return;
      holdingRef.current = false;
      setOpacity(0);
      tOut = window.setTimeout(() => {
        if (fadeGen.current !== gen) return;
        paintKeyRef.current = to;
        setPaint({ demo, view, drawSnapshot, sceneKey: to });
        tGap = window.setTimeout(() => {
          if (fadeGen.current !== gen) return;
          setOpacity(1);
        }, FADE_GAP_MS);
      }, FADE_OUT_MS);
    };

    const holdDemo = buildElimHoldDemo(demo, from);
    if (holdDemo) {
      holdingRef.current = true;
      setOpacity(1);
      setPaint({
        demo: holdDemo,
        view: 'duel',
        drawSnapshot: null,
        sceneKey: from,
      });
      tHold = window.setTimeout(startFadeOut, ELIM_HOLD_MS);
    } else {
      startFadeOut();
    }

    return () => {
      window.clearTimeout(tHold);
      window.clearTimeout(tOut);
      window.clearTimeout(tGap);
    };
  }, [sceneKey, demo, view, drawSnapshot]);

  const fadingOut = opacity < 0.5;
  const transitionMs = fadingOut ? FADE_OUT_MS : FADE_IN_MS;

  // Frame never fades — only the central body inside OverlaySceneBody.
  return (
    <OverlaySceneBody
      demo={paint.demo}
      view={paint.view}
      drawSnapshot={paint.drawSnapshot}
      contentOpacity={opacity}
      contentTransitionMs={transitionMs}
    />
  );
}

function OverlayFrame({
  champion,
  children,
}: {
  champion?: boolean;
  children: ReactNode;
}) {
  const shellBg = champion
    ? '#0b1220'
    : 'linear-gradient(165deg, #0b1220 0%, #101a2e 45%, #0a1020 100%)';
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        width: W,
        height: H,
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.12)',
        background: shellBg,
        boxShadow: champion
          ? 'inset 0 0 0 1px rgba(255,255,255,0.04)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 40px rgba(245,158,11,0.12)',
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        color: '#e2e8f0',
      }}
    >
      {children}
    </div>
  );
}

/** Fades only the central confrontation / ceremony body — never the chrome. */
function FadeContent({
  opacity,
  transitionMs,
  children,
}: {
  opacity: number;
  transitionMs: number;
  children: ReactNode;
}) {
  return (
    <div
      className="flex-1 min-h-0 overflow-hidden"
      style={{
        opacity,
        transition: `opacity ${transitionMs}ms ease`,
        willChange: 'opacity',
      }}
    >
      {children}
    </div>
  );
}

function OverlaySceneBody({
  demo,
  view,
  drawSnapshot,
  contentOpacity,
  contentTransitionMs,
}: {
  demo: BonusTournamentDemo;
  view?: BonusTournamentOverlayProps['view'];
  drawSnapshot?: DrawPublicSnapshot | null;
  contentOpacity: number;
  contentTransitionMs: number;
}) {
  const players = playerMap(demo);
  const champion = resolveTournamentChampion(demo, players);
  const isEntriesPhase =
    demo.status === 'entries' || demo.status === 'preparation' || demo.overlayView === 'entries';
  const activeView = view ?? demo.overlayView;
  const drawCeremonyLive =
    drawSnapshot != null &&
    drawSnapshot.phase !== 'idle' &&
    drawSnapshot.phase !== 'intro' &&
    (drawSnapshot.runStatus === 'running' ||
      drawSnapshot.runStatus === 'paused' ||
      drawSnapshot.runStatus === 'completed');
  const isDrawPhase =
    !champion &&
    drawCeremonyLive &&
    (activeView === 'draw' ||
      (demo.status === 'draw' &&
        activeView !== 'overview' &&
        activeView !== 'duel' &&
        activeView !== 'entries'));
  const selected = demo.matches.find((m) => m.id === demo.selectedMatchId) ?? null;
  const roundKey: BonusTournamentRound =
    selected?.round ??
    (demo.status === 'qf' || demo.status === 'sf' || demo.status === 'final'
      ? demo.status
      : 'qf');
  const hud = calcTournamentHudStats(demo);

  const viewName = String(activeView ?? '');
  const showEntries =
    !champion &&
    !isDrawPhase &&
    (viewName === 'entries' ||
      demo.status === 'entries' ||
      demo.status === 'preparation' ||
      (demo.status === 'draw' && (viewName === 'draw' || viewName === 'entries' || isEntriesPhase)));

  const duelChrome = !champion && !isDrawPhase && !showEntries;

  return (
    <OverlayFrame champion={Boolean(champion)}>
      <style>{`
        @keyframes btPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes btNumPulse {
          0% { transform: scale(1); opacity: 0.9; }
          35% { transform: scale(1.14); opacity: 1; }
          100% { transform: scale(0.92); opacity: 0; }
        }
        @keyframes btBoxFlash {
          0% { box-shadow: inset 0 0 0 1px rgba(251,191,36,0.2); }
          40% { box-shadow: inset 0 0 0 1px rgba(251,191,36,0.6), 0 0 12px rgba(251,191,36,0.22); }
          100% { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
        }
        @keyframes btResultIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bt-anim, .bt-reveal-num, .bt-reveal-box, .bt-reveal-result { animation: none !important; }
        }
        .bt-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Chrome: never fades. Round label / HUD swap with paint at opacity 0. */}
      {champion ? (
        <ChampionHeader />
      ) : duelChrome ? (
        <TournamentHeader
          roundLabel={ROUND_LABEL[roundKey]}
          live={selected?.status === 'live'}
          completed={false}
          hud={hud}
        />
      ) : null}

      <FadeContent opacity={contentOpacity} transitionMs={contentTransitionMs}>
        {isDrawPhase && drawSnapshot ? (
          <DrawSidebarOverlay snapshot={drawSnapshot} embedded />
        ) : showEntries ? (
          <EntriesOverlay demo={demo} />
        ) : champion ? (
          <ChampionCelebration key={champion.id} player={champion} />
        ) : activeView === 'overview' || !selected ? (
          <Overview demo={demo} players={players} round={roundKey} />
        ) : (
          <DuelView match={selected} players={players} />
        )}
      </FadeContent>
    </OverlayFrame>
  );
}

function TournamentHeader({
  roundLabel,
  live,
  completed,
  hud,
}: {
  roundLabel: string;
  live?: boolean;
  completed?: boolean;
  hud: ReturnType<typeof calcTournamentHudStats>;
}) {
  const plColor =
    hud.profitLoss > 0 ? '#4ade80' : hud.profitLoss < 0 ? '#f87171' : '#94a3b8';
  const plLabel = hud.profitLoss > 0 ? 'PROFIT' : hud.profitLoss < 0 ? 'LOSS' : 'P/L';
  const progress = Math.min(1, hud.realizedCount / hud.totalBuys);

  return (
    <div
      className="flex-shrink-0"
      style={{
        paddingLeft: PAD,
        paddingRight: PAD,
        paddingTop: 8,
        paddingBottom: 7,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black tracking-[0.16em]" style={{ color: '#fbbf24', fontSize: 9.5 }}>
            BONUS TOURNAMENT · DEMO
          </div>
          <div className="font-black tracking-wide text-white leading-none truncate mt-1" style={{ fontSize: 16 }}>
            {roundLabel}
          </div>
        </div>
        <div
          className="bt-anim w-2 h-2 rounded-full flex-shrink-0 mt-1"
          style={{
            background: live ? '#ef4444' : completed ? '#fbbf24' : '#64748b',
            boxShadow: live ? '0 0 10px #ef4444' : 'none',
            animation: live ? 'btPulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
        <HudMini
          label="POR COMPRAR"
          value={String(hud.remainingBuys)}
          color="#e2e8f0"
        />
        <HudMini label="GASTO" value={formatMoney(hud.gasto)} color="#e2e8f0" />
        <HudMini
          label={hud.provisional ? `${plLabel}·` : plLabel}
          value={formatMoney(hud.profitLoss)}
          color={plColor}
          hint={hud.provisional ? 'provisório' : undefined}
        />
      </div>

      <div className="mt-2">
        <div className="flex justify-between items-end mb-1">
          <span className="font-bold tracking-wider" style={{ color: '#64748b', fontSize: 8 }}>
            COMPRAS
          </span>
          <span className="font-black tabular-nums" style={{ color: '#94a3b8', fontSize: 9 }}>
            {hud.realizedCount}/{hud.totalBuys}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, #b89968, #fbbf24)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function HudMini({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <div
      className="min-w-0 text-center"
      style={{
        background: 'rgba(22, 32, 54, 0.9)',
        borderRadius: 6,
        paddingTop: 7,
        paddingBottom: 7,
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      <div
        className="font-bold leading-none whitespace-nowrap"
        style={{ color: '#64748b', fontSize: 7, letterSpacing: '0.05em' }}
        title={label}
      >
        {label}
      </div>
      <div className="mt-1.5 min-w-0">
        <AutoFitNumber
          value={value}
          maxFontSize={12}
          minFontSize={7}
          color={color}
          title={hint ? `${value} (${hint})` : value}
        />
      </div>
    </div>
  );
}

function Overview({
  demo,
  players,
  round,
}: {
  demo: BonusTournamentDemo;
  players: Record<string, BonusTournamentPlayer>;
  round: BonusTournamentRound;
}) {
  const list = matchesForRound(demo, round);
  if (list.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4 text-center text-[11px]" style={{ color: '#94a3b8' }}>
        {demo.status === 'entries'
          ? `${demo.entries.length} inscritos (DEMO) — aguarda sorteio`
          : 'Sem confrontos nesta fase (DEMO)'}
      </div>
    );
  }

  return (
    <div className="bt-scroll h-full overflow-y-auto space-y-1.5" style={{ scrollbarWidth: 'none', padding: PAD }}>
      {list.map((m) => {
        const a = players[m.playerAId];
        const b = players[m.playerBId];
        if (!a || !b) return null;
        const selected = m.id === demo.selectedMatchId;
        return (
          <div
            key={m.id}
            className="rounded-lg px-2 py-1.5"
            style={{
              background: selected ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.04)',
              border: selected ? '1px solid rgba(251,191,36,0.55)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <MiniPlayer p={a} winner={m.confirmedWinnerId === a.id} />
              <span className="text-[8px] font-black flex-shrink-0" style={{ color: '#fbbf24' }}>
                VS
              </span>
              <MiniPlayer p={b} winner={m.confirmedWinnerId === b.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniPlayer({ p, winner }: { p: BonusTournamentPlayer; winner?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <img
        src={p.avatarUrl}
        alt=""
        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        style={{ boxShadow: winner ? '0 0 0 1.5px #fbbf24' : 'none' }}
      />
      <span className="text-[10px] font-bold truncate" style={{ color: winner ? '#fde68a' : '#e2e8f0' }}>
        {p.displayName}
      </span>
    </div>
  );
}

function DuelView({
  match,
  players,
}: {
  match: BonusTournamentMatch;
  players: Record<string, BonusTournamentPlayer>;
}) {
  const a = players[match.playerAId];
  const b = players[match.playerBId];
  if (!a || !b) return null;

  const statsA = calcSideStats(match.buyPriceA, match.buysA);
  const statsB = calcSideStats(match.buyPriceB, match.buysB);
  const bothComplete = statsA.complete && statsB.complete;

  const suggested = bothComplete
    ? suggestWinner({
        playerAId: a.id,
        playerBId: b.id,
        buyPriceA: match.buyPriceA,
        buyPriceB: match.buyPriceB,
        buysA: match.buysA,
        buysB: match.buysB,
      })
    : null;

  const winnerId = match.confirmedWinnerId;

  return (
    <div
      className="h-full flex flex-col min-h-0 overflow-hidden"
      style={{ paddingLeft: DUEL_PAD_X, paddingRight: DUEL_PAD_X, paddingTop: 4, paddingBottom: 6 }}
    >
      {/* Zona A: entre o cabeçalho HUD e o VS — grupo centrado verticalmente */}
      <DuelZone label="A">
        <PlayerCard
          p={a}
          buyPrice={match.buyPriceA}
          buys={match.buysA}
          mirrored={false}
          isWinner={Boolean(winnerId && winnerId === a.id)}
          isEliminated={Boolean(winnerId && winnerId !== a.id)}
          showResult={bothComplete}
          suggested={Boolean(suggested && suggested === a.id && !winnerId)}
          shineId="bt-a"
        />
      </DuelZone>

      <VsSeparator />

      {/* Zona B: entre o VS e a margem inferior — grupo centrado verticalmente */}
      <DuelZone label="B">
        <PlayerCard
          p={b}
          buyPrice={match.buyPriceB}
          buys={match.buysB}
          mirrored
          isWinner={Boolean(winnerId && winnerId === b.id)}
          isEliminated={Boolean(winnerId && winnerId !== b.id)}
          showResult={bothComplete}
          suggested={Boolean(suggested && suggested === b.id && !winnerId)}
          shineId="bt-b"
        />
      </DuelZone>
    </div>
  );
}

/** Half-duel flex zone: vertically centers its player group without shrinking internals. */
function DuelZone({ label, children }: { label: string; children: ReactNode }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const zone = zoneRef.current;
    const group = groupRef.current;
    if (!zone || !group) return;

    const check = () => {
      const overflow = group.scrollHeight > zone.clientHeight + 1;
      zone.dataset.btZoneOverflow = overflow ? 'true' : 'false';
      if (overflow) {
        console.warn(
          `[BonusTournament] Zona ${label}: altura insuficiente (${group.scrollHeight}px conteúdo > ${zone.clientHeight}px zona). Não reduzir elementos.`,
        );
      }
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(zone);
    ro.observe(group);
    return () => ro.disconnect();
  }, [label]);

  return (
    <div
      ref={zoneRef}
      className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden"
      data-bt-duel-zone={label}
    >
      <div ref={groupRef} className="flex-shrink-0 w-full">
        {children}
      </div>
    </div>
  );
}

function VsSeparator() {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 w-full">
      <div
        className="flex-1"
        style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.35) 100%)' }}
      />
      <div
        className="flex items-center justify-center gap-1.5 flex-shrink-0"
        style={{
          width: 90,
          height: 40,
          background: 'rgba(22, 32, 54, 0.98)',
          border: '1px solid rgba(251, 191, 36, 0.5)',
          borderRadius: 6,
        }}
      >
        <Swords className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.25} style={{ color: '#fbbf24' }} />
        <span className="font-black tracking-[0.16em] leading-none" style={{ color: '#fbbf24', fontSize: 14 }}>
          VS
        </span>
      </div>
      <div
        className="flex-1"
        style={{ height: 1, background: 'linear-gradient(90deg, rgba(251,191,36,0.35) 0%, transparent 100%)' }}
      />
    </div>
  );
}

function PlayerCard({
  p,
  buyPrice,
  buys,
  mirrored,
  isWinner,
  isEliminated,
  showResult,
  suggested,
  shineId,
}: {
  p: BonusTournamentPlayer;
  buyPrice: number | null;
  buys: BonusTournamentMatch['buysA'];
  mirrored: boolean;
  isWinner: boolean;
  isEliminated: boolean;
  showResult: boolean;
  suggested: boolean;
  shineId: string;
}) {
  const stats = calcSideStats(buyPrice, buys);
  const winnerRing = isWinner && showResult;
  const suggestRing = suggested && !winnerRing && !isEliminated;

  // Mesmo intervalo nickname↔thumbnail nos dois lados (float da cover é interno).
  const header = (
    <div
      className={`flex items-center gap-2 min-w-0 w-full ${mirrored ? 'flex-row-reverse' : ''}`}
      style={{ marginBottom: mirrored ? 0 : 5, marginTop: mirrored ? 5 : 0 }}
    >
      {/* Wrapper absorbs ring so overflow-hidden zones cannot clip the circle */}
      <span
        className="flex-shrink-0 inline-flex"
        style={{ padding: AVATAR_RING_PAD, lineHeight: 0 }}
      >
        <img
          src={p.avatarUrl}
          alt=""
          width={AVATAR_PX}
          height={AVATAR_PX}
          className="rounded-full object-cover flex-shrink-0"
          style={{
            width: AVATAR_PX,
            height: AVATAR_PX,
            boxShadow: winnerRing
              ? '0 0 0 1.5px #fbbf24'
              : suggestRing
              ? '0 0 0 1px rgba(251,191,36,0.45)'
              : '0 0 0 1px rgba(255,255,255,0.2)',
          }}
        />
      </span>
      <div className={`min-w-0 flex-1 overflow-hidden ${mirrored ? 'text-right' : ''}`}>
        <div className="font-black truncate leading-none text-white" style={{ fontSize: 16 }} title={p.displayName}>
          {p.displayName}
        </div>
        {winnerRing && (
          <div className="text-[6px] font-black tracking-wider mt-0.5" style={{ color: '#fbbf24' }}>
            VENCEDOR
          </div>
        )}
      </div>
    </div>
  );

  const body = (
    <div className={`flex items-stretch gap-2 ${mirrored ? 'flex-row-reverse' : ''}`}>
      <div className="flex-shrink-0">
        <OpeningStyleSlotCover
          src={p.slotImage}
          alt={p.slotName}
          width={COVER_W}
          height={COVER_H}
          shineId={shineId}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {buys.map((buy, i) => (
          <BuyRevealBox key={`${shineId}-${i}`} index={i + 1} pay={buy.pay} buyPrice={buyPrice} />
        ))}
      </div>
    </div>
  );

  const totals = (
    <div className="grid grid-cols-3 gap-1.5" style={{ marginTop: mirrored ? 0 : 6, marginBottom: mirrored ? 6 : 0 }}>
      <MiniStatBox label="BUY" value={formatMoney(stats.buyPrice)} valueColor="#ffffff" />
      <MiniStatBox label="PAY TOTAL" value={formatMoney(stats.totalPay || null)} valueColor="#4ade80" />
      <MiniStatBox
        label="AVG"
        value={stats.complete ? formatAvg(stats.avg) : '—'}
        valueColor={stats.complete ? '#fbbf24' : '#64748b'}
        emphasized={stats.complete}
      />
    </div>
  );

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        filter: isEliminated ? 'grayscale(100%)' : undefined,
        opacity: isEliminated ? 0.45 : 1,
        transition: 'filter 400ms ease, opacity 400ms ease',
      }}
    >
      {mirrored ? (
        <>
          {totals}
          {body}
          {header}
        </>
      ) : (
        <>
          {header}
          {body}
          {totals}
        </>
      )}
    </div>
  );
}

/**
 * PENDING → REVEALING → REVEALED
 * Results are not mounted until mid-reveal (no flash behind the number).
 * Mount with pay already set → REVEALED immediately (no animation).
 * pay null→number triggers reveal once; number→number corrections stay REVEALED.
 */
function BuyRevealBox({
  index,
  pay,
  buyPrice,
}: {
  index: number;
  pay: number | null;
  buyPrice: number | null;
}) {
  const prevPay = useRef<number | null | undefined>(undefined);
  const [phase, setPhase] = useState<RevealPhase>(() => (pay === null ? 'pending' : 'revealed'));
  const [showResults, setShowResults] = useState(() => pay !== null);

  useEffect(() => {
    // Initial sync — never animate on mount
    if (prevPay.current === undefined) {
      prevPay.current = pay;
      setPhase(pay === null ? 'pending' : 'revealed');
      setShowResults(pay !== null);
      return;
    }

    const prev = prevPay.current;

    if (prev === null && pay !== null) {
      setPhase('revealing');
      setShowResults(false);
      prevPay.current = pay;
      const mid = window.setTimeout(() => setShowResults(true), REVEAL_MID_MS);
      const end = window.setTimeout(() => setPhase('revealed'), REVEAL_MS);
      return () => {
        window.clearTimeout(mid);
        window.clearTimeout(end);
      };
    }

    if (pay === null) {
      prevPay.current = null;
      setPhase('pending');
      setShowResults(false);
      return;
    }

    // Already had a pay (correction) or stable revealed
    prevPay.current = pay;
    setPhase('revealed');
    setShowResults(true);
  }, [pay]);

  const multi = calcMulti(buyPrice, pay);
  const showingNumber = phase === 'pending' || (phase === 'revealing' && !showResults);
  const isRevealing = phase === 'revealing';

  return (
    <div
      className={`bt-reveal-box flex items-center min-w-0 ${showingNumber ? 'justify-center' : ''}`}
      style={{
        borderRadius: 7,
        padding: '8px 9px',
        minHeight: 42,
        background: showingNumber ? 'rgba(18, 28, 48, 0.92)' : 'rgba(0,0,0,0.38)',
        border: showingNumber
          ? isRevealing
            ? '1px solid rgba(251,191,36,0.45)'
            : '1px solid rgba(251,191,36,0.22)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: showingNumber ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : undefined,
        // One stable outer node for the whole reveal — flash runs once, never remounts mid-way
        animation: isRevealing ? `btBoxFlash ${REVEAL_MS}ms ease-out` : 'none',
      }}
    >
      {showingNumber ? (
        <span
          className="bt-reveal-num font-black tabular-nums leading-none"
          style={{
            color: isRevealing ? '#fde68a' : 'rgba(253, 230, 138, 0.88)',
            fontSize: 22,
            animation: isRevealing ? `btNumPulse ${REVEAL_MS}ms ease-out forwards` : 'none',
          }}
        >
          {index}
        </span>
      ) : (
        <div
          className="bt-reveal-result flex-1 min-w-0 grid grid-cols-2 gap-1"
          style={{
            animation: isRevealing ? `btResultIn ${REVEAL_MS - REVEAL_MID_MS}ms ease-out both` : 'none',
          }}
        >
          <div className="min-w-0 text-center leading-none">
            <div className="font-bold tracking-wide" style={{ color: '#94a3b8', fontSize: 8 }}>
              PAY
            </div>
            <div className="mt-0.5 min-w-0">
              <AutoFitNumber value={formatMoney(pay)} maxFontSize={14} minFontSize={7} color="#4ade80" />
            </div>
          </div>
          <div className="min-w-0 text-center leading-none">
            <div className="font-bold tracking-wide" style={{ color: '#94a3b8', fontSize: 8 }}>
              MULTI
            </div>
            <div className="mt-0.5 min-w-0">
              <AutoFitNumber value={formatMulti(multi)} maxFontSize={14} minFontSize={7} color="#fde68a" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStatBox({
  label,
  value,
  valueColor,
  emphasized,
}: {
  label: string;
  value: string;
  valueColor: string;
  /** Gold border when AVG is fully calculated (all 3 pays registered). */
  emphasized?: boolean;
}) {
  return (
    <div
      className="min-w-0 px-1 text-center"
      style={{
        background: 'rgba(22, 32, 54, 0.95)',
        borderRadius: 6,
        paddingTop: 7,
        paddingBottom: 7,
        // Transparent border keeps layout stable when emphasis toggles
        border: emphasized ? '1px solid rgba(251, 191, 36, 0.55)' : '1px solid transparent',
        boxShadow: emphasized ? 'inset 0 0 0 1px rgba(251, 191, 36, 0.1)' : 'none',
        transition: 'border-color 280ms ease, box-shadow 280ms ease',
      }}
    >
      <div className="text-[7px] font-bold tracking-wider leading-none mb-1" style={{ color: '#64748b' }}>
        {label}
      </div>
      <AutoFitNumber value={value} maxFontSize={13} minFontSize={7} color={valueColor} />
    </div>
  );
}
