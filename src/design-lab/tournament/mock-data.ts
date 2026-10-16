import type { LabMatch, LabParticipant, LabPhase, RoundId } from './types';

const NAMES = [
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
];

export const LAB_PARTICIPANTS: LabParticipant[] = NAMES.map((name, i) => ({
  id: `p${i + 1}`,
  name,
  seed: i + 1,
  avatarHue: (i * 37) % 360,
}));

function pair(round: RoundId, index: number, a: LabParticipant, b: LabParticipant, extra: Partial<LabMatch> = {}): LabMatch {
  return {
    id: `${round}-${index}`,
    round,
    index,
    a,
    b,
    status: 'upcoming',
    ...extra,
  };
}

/** Snapshot of matches for a given lab phase (simulated progression). */
export function matchesForPhase(phase: LabPhase): { matches: LabMatch[]; liveMatchId: string | null; championId: string | null } {
  const P = LAB_PARTICIPANTS;

  if (phase === 'intro') {
    return { matches: [], liveMatchId: null, championId: null };
  }

  const r16: LabMatch[] = [
    pair('r16', 0, P[0], P[1], { status: 'done', scoreA: 3, scoreB: 1, winnerId: P[0].id }),
    pair('r16', 1, P[2], P[3], { status: 'done', scoreA: 2, scoreB: 3, winnerId: P[3].id }),
    pair('r16', 2, P[4], P[5], { status: 'done', scoreA: 4, scoreB: 0, winnerId: P[4].id }),
    pair('r16', 3, P[6], P[7], { status: 'live', scoreA: 1, scoreB: 1 }),
    pair('r16', 4, P[8], P[9], { status: 'upcoming' }),
    pair('r16', 5, P[10], P[11], { status: 'upcoming' }),
    pair('r16', 6, P[12], P[13], { status: 'upcoming' }),
    pair('r16', 7, P[14], P[15], { status: 'upcoming' }),
  ];

  if (phase === 'r16') {
    return { matches: r16, liveMatchId: 'r16-3', championId: null };
  }

  const qfBase = [
    pair('qf', 0, P[0], P[3], { status: 'done', scoreA: 3, scoreB: 2, winnerId: P[0].id }),
    pair('qf', 1, P[4], P[6], { status: 'live', scoreA: 2, scoreB: 1 }),
    pair('qf', 2, P[8], P[10], { status: 'upcoming' }),
    pair('qf', 3, P[12], P[14], { status: 'upcoming' }),
  ];

  if (phase === 'qf') {
    return {
      matches: [
        ...r16.map((m, i) =>
          i <= 3
            ? { ...m, status: 'done' as const, winnerId: m.winnerId ?? (i === 3 ? P[6].id : m.winnerId), scoreA: m.scoreA ?? 3, scoreB: m.scoreB ?? 1 }
            : {
                ...m,
                status: 'done' as const,
                winnerId: [P[8], P[10], P[12], P[14]][i - 4].id,
                scoreA: 3,
                scoreB: 1,
              },
        ),
        ...qfBase,
      ],
      liveMatchId: 'qf-1',
      championId: null,
    };
  }

  const sf = [
    pair('sf', 0, P[0], P[4], { status: 'live', scoreA: 2, scoreB: 2 }),
    pair('sf', 1, P[8], P[12], { status: 'upcoming' }),
  ];

  if (phase === 'sf') {
    return {
      matches: [
        ...r16.map((m) => ({ ...m, status: 'done' as const })),
        pair('qf', 0, P[0], P[3], { status: 'done', scoreA: 3, scoreB: 2, winnerId: P[0].id }),
        pair('qf', 1, P[4], P[6], { status: 'done', scoreA: 3, scoreB: 1, winnerId: P[4].id }),
        pair('qf', 2, P[8], P[10], { status: 'done', scoreA: 3, scoreB: 0, winnerId: P[8].id }),
        pair('qf', 3, P[12], P[14], { status: 'done', scoreA: 2, scoreB: 3, winnerId: P[12].id }),
        ...sf,
      ],
      liveMatchId: 'sf-0',
      championId: null,
    };
  }

  const finalMatch = pair('final', 0, P[0], P[8], {
    status: phase === 'champion' ? 'done' : 'live',
    scoreA: phase === 'champion' ? 4 : 2,
    scoreB: phase === 'champion' ? 1 : 2,
    winnerId: phase === 'champion' ? P[0].id : undefined,
  });

  return {
    matches: [
      ...r16.map((m) => ({ ...m, status: 'done' as const })),
      pair('qf', 0, P[0], P[3], { status: 'done', scoreA: 3, scoreB: 2, winnerId: P[0].id }),
      pair('qf', 1, P[4], P[6], { status: 'done', scoreA: 3, scoreB: 1, winnerId: P[4].id }),
      pair('qf', 2, P[8], P[10], { status: 'done', scoreA: 3, scoreB: 0, winnerId: P[8].id }),
      pair('qf', 3, P[12], P[14], { status: 'done', scoreA: 2, scoreB: 3, winnerId: P[12].id }),
      pair('sf', 0, P[0], P[4], { status: 'done', scoreA: 3, scoreB: 2, winnerId: P[0].id }),
      pair('sf', 1, P[8], P[12], { status: 'done', scoreA: 3, scoreB: 1, winnerId: P[8].id }),
      finalMatch,
    ],
    liveMatchId: phase === 'champion' ? null : 'final-0',
    championId: phase === 'champion' ? P[0].id : null,
  };
}

export function liveMatch(matches: LabMatch[], liveMatchId: string | null): LabMatch | null {
  if (!liveMatchId) return null;
  return matches.find((m) => m.id === liveMatchId) ?? null;
}

export function roundMatches(matches: LabMatch[], round: RoundId): LabMatch[] {
  return matches.filter((m) => m.round === round).sort((a, b) => a.index - b.index);
}
