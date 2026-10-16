/**
 * Build QF bracket from draw result and advance winners QF → SF → Final → Champion.
 * Visual/dashboard only — does not invent winners (caller supplies confirmedWinnerId).
 */

import type { DrawParticipant, DrawResult } from './draw-types';
import type {
  BonusTournamentBuy,
  BonusTournamentDemo,
  BonusTournamentMatch,
  BonusTournamentPlayer,
  BonusTournamentStatus,
} from './types';

function emptyBuys(): [BonusTournamentBuy, BonusTournamentBuy, BonusTournamentBuy] {
  return [
    { pay: null, realized: false },
    { pay: null, realized: false },
    { pay: null, realized: false },
  ];
}

const PENDING = '__pending__';

export function participantToPlayer(p: DrawParticipant): BonusTournamentPlayer {
  return {
    id: p.twitchUserId,
    twitchUserId: p.twitchUserId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    slotName: p.slot?.slotName ?? '',
    slotImage: p.slot?.slotImage ?? '',
  };
}

function makeMatch(
  round: BonusTournamentMatch['round'],
  index: number,
  playerAId: string,
  playerBId: string,
  status: BonusTournamentMatch['status'] = 'pending',
): BonusTournamentMatch {
  return {
    id: `${round}-${index}`,
    round,
    index,
    playerAId,
    playerBId,
    buyPriceA: null,
    buyPriceB: null,
    buysA: emptyBuys(),
    buysB: emptyBuys(),
    confirmedWinnerId: null,
    status,
  };
}

/** Create 4 QF + empty SF/Final shells from a locked draw result. */
export function buildMatchesFromDrawResult(result: DrawResult): {
  players: BonusTournamentPlayer[];
  matches: BonusTournamentMatch[];
  selectedMatchId: string;
} {
  const players = result.selected.map(participantToPlayer);
  const qf = result.matchups.map((m, i) =>
    makeMatch('qf', i, m.playerA.twitchUserId, m.playerB.twitchUserId, i === 0 ? 'live' : 'pending'),
  );
  const sf = [makeMatch('sf', 0, PENDING, PENDING), makeMatch('sf', 1, PENDING, PENDING)];
  const final = makeMatch('final', 0, PENDING, PENDING);
  return {
    players,
    matches: [...qf, ...sf, final],
    selectedMatchId: 'qf-0',
  };
}

export function isMatchPlayable(
  match: BonusTournamentMatch,
  players: Record<string, BonusTournamentPlayer>,
): boolean {
  if (match.playerAId === PENDING || match.playerBId === PENDING) return false;
  return Boolean(players[match.playerAId] && players[match.playerBId]);
}

/** Ordered progression of match ids. */
export const MATCH_ORDER = [
  'qf-0',
  'qf-1',
  'qf-2',
  'qf-3',
  'sf-0',
  'sf-1',
  'final-0',
] as const;

function findMatch(matches: BonusTournamentMatch[], id: string): BonusTournamentMatch | undefined {
  return matches.find((m) => m.id === id);
}

/**
 * After confirming a winner: mark match done, fill next-round seats, select next playable match.
 */
export function confirmWinnerAndAdvance(
  demo: BonusTournamentDemo,
  matchId: string,
  winnerPlayerId: string,
): BonusTournamentDemo {
  let matches = demo.matches.map((m) =>
    m.id === matchId ? { ...m, confirmedWinnerId: winnerPlayerId, status: 'done' as const } : m,
  );

  const done = findMatch(matches, matchId);
  if (!done) return demo;

  // Propagate winners into later rounds (ids are twitchUserId / player.id).
  if (done.round === 'qf') {
    const sfIndex = done.index < 2 ? 0 : 1;
    const seat: 'A' | 'B' = done.index % 2 === 0 ? 'A' : 'B';
    matches = matches.map((m) => {
      if (m.id !== `sf-${sfIndex}`) return m;
      return seat === 'A'
        ? { ...m, playerAId: winnerPlayerId }
        : { ...m, playerBId: winnerPlayerId };
    });
  } else if (done.round === 'sf') {
    const seat: 'A' | 'B' = done.index === 0 ? 'A' : 'B';
    matches = matches.map((m) => {
      if (m.id !== 'final-0') return m;
      return seat === 'A'
        ? { ...m, playerAId: winnerPlayerId }
        : { ...m, playerBId: winnerPlayerId };
    });
  }

  const playersMap: Record<string, BonusTournamentPlayer> = {};
  for (const p of demo.players) playersMap[p.id] = p;

  // Mark SF/Final live when both seats filled.
  matches = matches.map((m) => {
    if (m.round === 'qf') return m;
    if (m.status === 'done') return m;
    if (isMatchPlayable(m, playersMap) && m.playerAId !== PENDING) {
      return { ...m, status: m.status === 'pending' ? 'pending' : m.status };
    }
    return m;
  });

  let status: BonusTournamentStatus = demo.status;
  let selectedMatchId = demo.selectedMatchId;
  let overlayView = demo.overlayView;

  if (done.round === 'final') {
    status = 'completed';
    selectedMatchId = 'final-0';
    overlayView = 'overview';
  } else {
    const nextId = nextPlayableMatchId(matches, playersMap, matchId);
    if (nextId) {
      selectedMatchId = nextId;
      matches = matches.map((m) =>
        m.id === nextId && m.status !== 'done' ? { ...m, status: 'live' as const } : m,
      );
      const next = findMatch(matches, nextId);
      if (next?.round === 'sf') status = 'sf';
      else if (next?.round === 'final') status = 'final';
      else if (next?.round === 'qf') status = 'qf';
      overlayView = 'duel';
    } else {
      // Wait for remaining matches in current round
      const nextPending = MATCH_ORDER.find((id) => {
        const m = findMatch(matches, id);
        return m && m.status !== 'done' && isMatchPlayable(m, playersMap);
      });
      if (nextPending) {
        selectedMatchId = nextPending;
        matches = matches.map((m) =>
          m.id === nextPending && m.status !== 'done' ? { ...m, status: 'live' as const } : m,
        );
        const next = findMatch(matches, nextPending);
        if (next?.round === 'sf') status = 'sf';
        else if (next?.round === 'final') status = 'final';
        else status = 'qf';
        overlayView = 'duel';
      }
    }
  }

  return {
    ...demo,
    status,
    matches,
    selectedMatchId,
    overlayView,
  };
}

function nextPlayableMatchId(
  matches: BonusTournamentMatch[],
  players: Record<string, BonusTournamentPlayer>,
  afterId: string,
): string | null {
  const start = MATCH_ORDER.indexOf(afterId as (typeof MATCH_ORDER)[number]);
  const order = start >= 0 ? MATCH_ORDER.slice(start + 1) : MATCH_ORDER;
  for (const id of order) {
    const m = findMatch(matches, id);
    if (!m || m.status === 'done' || m.confirmedWinnerId) continue;
    if (!isMatchPlayable(m, players)) continue;
    return id;
  }
  return null;
}

export function applyDrawLaunchToDemo(
  demo: BonusTournamentDemo,
  result: DrawResult,
): BonusTournamentDemo {
  // Do not rebuild if QF already persisted.
  if (demo.matches.some((m) => m.round === 'qf' && m.playerAId !== PENDING)) {
    return {
      ...demo,
      status: demo.status === 'draw' ? 'qf' : demo.status,
      overlayView: 'duel',
      selectedMatchId: demo.selectedMatchId ?? 'qf-0',
    };
  }
  const built = buildMatchesFromDrawResult(result);
  return {
    ...demo,
    status: 'qf',
    players: built.players,
    matches: built.matches,
    selectedMatchId: built.selectedMatchId,
    overlayView: 'duel',
    entriesConfig: {
      ...demo.entriesConfig,
      entriesOpen: false,
      timerPaused: true,
    },
  };
}

export { PENDING as PENDING_PLAYER_ID };
