import { SLOT_FALLBACK_IMAGE, TOP_SLOT_FALLBACK_IMAGE } from '../../lib/slot-image';
import type {
  BonusTournamentBuy,
  BonusTournamentDemo,
  BonusTournamentEntriesConfig,
  BonusTournamentEntry,
  BonusTournamentMatch,
  BonusTournamentPlayer,
  BonusTournamentStatus,
} from './types';

const DEMO_NAMES = [
  'NEXUS',
  'VantaFox',
  'RioBlaze',
  'KaitoZero',
  'MiraStorm',
  'EchoPrime',
  'LunaHex',
  'OrbitKing',
  'ShadeNova',
  'PixelRogue',
  'AetherLynx',
  'VoltQuinn',
  'CrimsonTape',
  'GhostReef',
  'NovaDrift',
  'JigaAce',
  'SpecterJay',
  'BoltMira',
];

const DEMO_SLOTS = [
  'Gates of Olympus',
  'Sugar Rush',
  'Wanted Dead or a Wild',
  'Le King',
  'Densho',
  'Starlight Princess',
  'Rip City',
  'Cursed Seas',
  'Fist of Destruction',
  'Rotten',
  'Cash Crooks',
  'Chaos Crew',
  'San Quentin',
  'Mental',
  'Hand of Anubis',
  'Zeus vs Hades',
];

/** Local DEMO picks when the remote slot catalog is unavailable. */
export function buildDemoSlotCatalogPicks(count = 8): Array<{
  slotId: string;
  slotName: string;
  slotImage: string;
}> {
  return Array.from({ length: count }, (_, i) => ({
    slotId: `demo-slot-${i + 1}`,
    slotName: DEMO_SLOTS[i % DEMO_SLOTS.length]!,
    // Prefer portrait card asset over generic "?" SVG for DEMO stills.
    slotImage: TOP_SLOT_FALLBACK_IMAGE,
  }));
}

function emptyBuys(): [BonusTournamentBuy, BonusTournamentBuy, BonusTournamentBuy] {
  return [
    { pay: null, realized: false },
    { pay: null, realized: false },
    { pay: null, realized: false },
  ];
}

/** Realized opens (taken). pay=null means awaiting PAY; pay=0 is a valid result. */
function pays(
  values: Array<number | null>,
): [BonusTournamentBuy, BonusTournamentBuy, BonusTournamentBuy] {
  const base = emptyBuys();
  values.forEach((pay, i) => {
    if (i < 3) base[i] = { pay, realized: true };
  });
  return base;
}

function demoAvatar(name: string, seed: number): string {
  const bg = ['0f172a', '1e293b', '312e81', '422006', '134e4a', '3f1d4d'][seed % 6];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=f8fafc&size=128&bold=true&format=png`;
}

function demoDisplayName(i: number): string {
  if (i < DEMO_NAMES.length) return DEMO_NAMES[i];
  return `Viewer${i + 1}`;
}

export function buildDemoPlayers(count = 8): BonusTournamentPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const name = demoDisplayName(i);
    return {
      id: `demo-p${i + 1}`,
      twitchUserId: `demo_twitch_${1000 + i}`,
      displayName: name,
      avatarUrl: demoAvatar(name, i),
      slotName: DEMO_SLOTS[i % DEMO_SLOTS.length],
      slotImage: SLOT_FALLBACK_IMAGE,
    };
  });
}

export function buildDemoEntries(count: number, enrolledAt = new Date().toISOString()): BonusTournamentEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const name = demoDisplayName(i);
    return {
      id: `demo-e${i + 1}`,
      twitchUserId: `demo_twitch_${1000 + i}`,
      displayName: name,
      avatarUrl: demoAvatar(name, i),
      enrolledAt,
    };
  });
}

export function defaultEntriesConfig(
  partial: Partial<BonusTournamentEntriesConfig> = {},
): BonusTournamentEntriesConfig {
  return {
    tournamentTitle: 'HUNT DOS REIS',
    prizePool: 250,
    chatCommand: '!torneio',
    durationSeconds: 5 * 60,
    timerStartedAt: Date.now(),
    timerPaused: false,
    remainingSecondsSnapshot: null,
    entriesOpen: true,
    ...partial,
  };
}

/** Remaining seconds from a reference start — not decremented per render. */
export function getEntriesRemainingSeconds(
  config: BonusTournamentEntriesConfig,
  now = Date.now(),
): number {
  if (!config.entriesOpen) {
    return Math.max(0, config.remainingSecondsSnapshot ?? 0);
  }
  if (config.timerPaused) {
    return Math.max(0, config.remainingSecondsSnapshot ?? config.durationSeconds);
  }
  if (config.timerStartedAt == null) {
    return config.durationSeconds;
  }
  const elapsed = Math.floor((now - config.timerStartedAt) / 1000);
  return Math.max(0, config.durationSeconds - elapsed);
}

function pair(
  round: BonusTournamentMatch['round'],
  index: number,
  a: BonusTournamentPlayer,
  b: BonusTournamentPlayer,
  extra: Partial<BonusTournamentMatch> = {},
): BonusTournamentMatch {
  return {
    id: `${round}-${index}`,
    round,
    index,
    playerAId: a.id,
    playerBId: b.id,
    buyPriceA: null,
    buyPriceB: null,
    buysA: emptyBuys(),
    buysB: emptyBuys(),
    confirmedWinnerId: null,
    status: 'pending',
    ...extra,
  };
}

/** Full demo snapshot for a given status (clearly synthetic). 8 players → QF. */
export function createDemoTournament(status: BonusTournamentStatus = 'qf'): BonusTournamentDemo {
  const pool = buildDemoPlayers(18);
  const players = pool.slice(0, 8);
  const entryPool = buildDemoEntries(18);

  // Same player keeps the same slot across rounds; BUY prices differ per match.
  const qf: BonusTournamentMatch[] = [
    pair('qf', 0, players[0]!, players[1]!, {
      status: 'live',
      buyPriceA: 0.4,
      buyPriceB: 0.5,
      buysA: pays([6, 14, null]),
      buysB: pays([10, null, null]),
    }),
    pair('qf', 1, players[2]!, players[3]!, {
      status: 'done',
      confirmedWinnerId: players[3]!.id,
      buyPriceA: 0.2,
      buyPriceB: 0.5,
      buysA: pays([2, 1, 5]),
      buysB: pays([40, 10, 18]),
    }),
    pair('qf', 2, players[4]!, players[5]!),
    pair('qf', 3, players[6]!, players[7]!),
  ];

  const sf: BonusTournamentMatch[] = [
    pair('sf', 0, players[0]!, players[3]!, { status: 'live' }),
    pair('sf', 1, players[4]!, players[6]!),
  ];

  const finalMatch: BonusTournamentMatch[] = [
    pair('final', 0, players[0]!, players[4]!, {
      status: status === 'completed' ? 'done' : 'live',
      confirmedWinnerId: status === 'completed' ? players[0]!.id : null,
      buyPriceA: 1.5,
      buyPriceB: 0.8,
      buysA:
        status === 'completed'
          ? pays([120, 40, 55])
          : pays([40, 22, null]),
      buysB:
        status === 'completed'
          ? pays([30, 18, 25])
          : pays([28, 16, null]),
    }),
  ];

  let matches: BonusTournamentMatch[] = [];
  let selectedMatchId: string | null = null;

  if (status === 'qf') {
    matches = qf;
    selectedMatchId = 'qf-0';
  } else if (status === 'sf') {
    matches = [
      ...qf.map((m, i) => ({
        ...m,
        status: 'done' as const,
        confirmedWinnerId: [players[0]!.id, players[3]!.id, players[4]!.id, players[6]!.id][i]!,
        buyPriceA: m.buyPriceA ?? 0.4,
        buyPriceB: m.buyPriceB ?? 0.5,
        buysA: m.buysA[0]?.realized ? m.buysA : pays([12, 8, 22]),
        buysB: m.buysB[0]?.realized ? m.buysB : pays([4, 9, 3]),
      })),
      ...sf,
    ];
    selectedMatchId = 'sf-0';
  } else if (status === 'final' || status === 'completed') {
    matches = [
      ...qf.map((m, i) => ({
        ...m,
        status: 'done' as const,
        confirmedWinnerId: [players[0]!.id, players[3]!.id, players[4]!.id, players[6]!.id][i]!,
        buyPriceA: m.buyPriceA ?? 0.4,
        buyPriceB: m.buyPriceB ?? 0.5,
        buysA: pays([12, 8, 22]),
        buysB: pays([4, 9, 3]),
      })),
      ...sf.map((m, i) => ({
        ...m,
        status: 'done' as const,
        confirmedWinnerId: [players[0]!.id, players[4]!.id][i]!,
        // BUY left null in demo to document no auto-carry into SF from QF
        buysA: pays([30, 12, 18]),
        buysB: pays([20, 25, 10]),
      })),
      ...finalMatch,
    ];
    selectedMatchId = 'final-0';
  }

  const isEntriesPhase = status === 'entries' || status === 'preparation';

  return {
    id: 'demo-bonus-tournament',
    name: 'BONUS TOURNAMENT · DEMO',
    isDemo: true,
    status,
    entries: isEntriesPhase ? entryPool : entryPool.slice(0, 8),
    entriesConfig: defaultEntriesConfig({
      entriesOpen: status === 'entries',
      timerStartedAt: status === 'entries' ? Date.now() : null,
      remainingSecondsSnapshot: status === 'entries' ? null : 0,
    }),
    players: isEntriesPhase ? [] : players,
    matches,
    selectedMatchId,
    overlayView: isEntriesPhase
      ? 'entries'
      : status === 'qf' || status === 'sf' || status === 'final'
        ? 'duel'
        : 'overview',
  };
}

export function playerMap(demo: BonusTournamentDemo): Record<string, BonusTournamentPlayer> {
  const map: Record<string, BonusTournamentPlayer> = {};
  for (const p of demo.players) map[p.id] = p;
  return map;
}

export function matchesForRound(demo: BonusTournamentDemo, round: BonusTournamentMatch['round']) {
  return demo.matches.filter((m) => m.round === round).sort((a, b) => a.index - b.index);
}
