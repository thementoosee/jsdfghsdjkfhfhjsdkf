/**
 * Bracket view-model for the horizontal OBS center overlay (1288×720).
 * Source of truth remains demo/draw results — this only projects display state.
 */

import {
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  type DrawMatchup,
  type DrawParticipant,
  type DrawSlotChoice,
} from './draw-types';
import { buildDemoPlayers, buildDemoSlotCatalogPicks, createDemoTournament } from './demo-data';
import type { BonusTournamentDemo, BonusTournamentMatch, BonusTournamentPlayer } from './types';

export const BRACKET_PLAYER_COUNT = DRAW_SLOT_COUNT; // 8
export const BRACKET_QF_COUNT = DRAW_MATCH_COUNT; // 4
export const BRACKET_SF_COUNT = 2;
export const BRACKET_FINAL_COUNT = 1;

/** Casino cutout size (confirmed via getMainOverlayCasinoCutout). */
export const BRACKET_OVERLAY_W = 1288;
export const BRACKET_OVERLAY_H = 720;

export type BracketDemoStage = 'qf' | 'after_qf' | 'after_sf' | 'final' | 'champion';

export const BRACKET_DEMO_STAGES: { id: BracketDemoStage; label: string }[] = [
  { id: 'qf', label: 'Quartos' },
  { id: 'after_qf', label: 'Após quartos' },
  { id: 'after_sf', label: 'Após meias' },
  { id: 'final', label: 'Final' },
  { id: 'champion', label: 'Campeão' },
];

export interface BracketSeat {
  participant: DrawParticipant | null;
  /** True when this seat lost its match. */
  eliminated: boolean;
  /** True when this seat won its current-round match. */
  winner: boolean;
}

export interface BracketMatchView {
  id: string;
  label: string;
  sublabel: string;
  playerA: BracketSeat;
  playerB: BracketSeat;
  /** Confirmed winner twitch id, if any. */
  winnerId: string | null;
}

export interface BracketView {
  stage: BracketDemoStage | 'live';
  title: string;
  quarterfinals: [BracketMatchView, BracketMatchView, BracketMatchView, BracketMatchView];
  semifinals: [BracketMatchView, BracketMatchView];
  final: BracketMatchView;
  champion: DrawParticipant | null;
}

/** Legacy alias used by the previous stub. */
export type BracketTree = BracketView;

export function playerToBracketParticipant(p: BonusTournamentPlayer): DrawParticipant {
  const slot: DrawSlotChoice = {
    slotId: p.slotName,
    slotName: p.slotName,
    slotImage: p.slotImage,
  };
  return {
    twitchUserId: p.twitchUserId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    slot,
  };
}

function seat(
  participant: DrawParticipant | null,
  winnerId: string | null,
): BracketSeat {
  if (!participant) return { participant: null, eliminated: false, winner: false };
  if (!winnerId) return { participant, eliminated: false, winner: false };
  const won = participant.twitchUserId === winnerId;
  return { participant, eliminated: !won, winner: won };
}

function matchView(
  id: string,
  label: string,
  sublabel: string,
  a: DrawParticipant | null,
  b: DrawParticipant | null,
  winnerId: string | null,
): BracketMatchView {
  return {
    id,
    label,
    sublabel,
    playerA: seat(a, winnerId),
    playerB: seat(b, winnerId),
    winnerId,
  };
}

function emptyMatch(id: string, label: string, sublabel: string): BracketMatchView {
  return matchView(id, label, sublabel, null, null, null);
}

function fromDemoMatch(
  m: BonusTournamentMatch | undefined,
  players: Record<string, BonusTournamentPlayer>,
  label: string,
  sublabel: string,
): BracketMatchView {
  if (!m) return emptyMatch('pending', label, sublabel);
  const a = players[m.playerAId] ? playerToBracketParticipant(players[m.playerAId]!) : null;
  const b = players[m.playerBId] ? playerToBracketParticipant(players[m.playerBId]!) : null;
  const winnerTwitch =
    m.confirmedWinnerId && players[m.confirmedWinnerId]
      ? players[m.confirmedWinnerId]!.twitchUserId
      : null;
  return matchView(m.id, label, sublabel, a, b, winnerTwitch);
}

/** Project live/demo tournament state into a bracket view (read-only). */
export function buildBracketViewFromDemo(
  demo: BonusTournamentDemo,
  stageHint: BracketDemoStage | 'live' = 'live',
): BracketView {
  const players: Record<string, BonusTournamentPlayer> = {};
  for (const p of demo.players) players[p.id] = p;

  const qf = [0, 1, 2, 3].map((i) =>
    fromDemoMatch(
      demo.matches.find((m) => m.round === 'qf' && m.index === i),
      players,
      'Quartos de Final',
      '',
    ),
  ) as BracketView['quarterfinals'];

  const sf = [0, 1].map((i) =>
    fromDemoMatch(
      demo.matches.find((m) => m.round === 'sf' && m.index === i),
      players,
      'Meias-Finais',
      '',
    ),
  ) as BracketView['semifinals'];

  const finMatch = demo.matches.find((m) => m.round === 'final');
  const final = fromDemoMatch(finMatch, players, 'Final', '');

  let champion: DrawParticipant | null = null;
  if (demo.status === 'completed' && finMatch?.confirmedWinnerId) {
    const p = players[finMatch.confirmedWinnerId];
    if (p) champion = playerToBracketParticipant(p);
  }

  return {
    stage: stageHint,
    title: demo.entriesConfig.tournamentTitle || demo.name || 'Bonus Tournament',
    quarterfinals: qf,
    semifinals: sf,
    final,
    champion,
  };
}

/**
 * Isolated DEMO stages — does not mutate the Manager tournament.
 * Uses synthetic players; winners filled according to stage.
 */
export function buildDemoBracketView(stage: BracketDemoStage): BracketView {
  const pool = buildDemoPlayers(8);
  const slotPicks = buildDemoSlotCatalogPicks(8);
  for (let i = 0; i < pool.length; i += 1) {
    const pick = slotPicks[i]!;
    pool[i] = {
      ...pool[i]!,
      slotName: pick.slotName,
      slotImage: pick.slotImage,
    };
  }
  // Stress long nickname + shared slot name for visual QA.
  pool[1] = {
    ...pool[1]!,
    displayName: 'PixelRogueXXL_LongName',
  };
  pool[5] = {
    ...pool[5]!,
    slotName: pool[4]!.slotName,
    slotImage: pool[4]!.slotImage,
  };

  const p = pool.map(playerToBracketParticipant);
  const qfWinners = [p[0]!, p[3]!, p[4]!, p[6]!];
  const sfWinners = [qfWinners[0]!, qfWinners[2]!];

  const qfDone = stage !== 'qf';
  const sfReady = stage !== 'qf';
  const sfDone = stage === 'after_sf' || stage === 'final' || stage === 'champion';
  const finalReady = stage === 'after_sf' || stage === 'final' || stage === 'champion';

  const quarterfinals: BracketView['quarterfinals'] = [
    matchView('qf-0', 'Quartos de Final', '', p[0]!, p[1]!, qfDone ? qfWinners[0]!.twitchUserId : null),
    matchView('qf-1', 'Quartos de Final', '', p[2]!, p[3]!, qfDone ? qfWinners[1]!.twitchUserId : null),
    matchView('qf-2', 'Quartos de Final', '', p[4]!, p[5]!, qfDone ? qfWinners[2]!.twitchUserId : null),
    matchView('qf-3', 'Quartos de Final', '', p[6]!, p[7]!, qfDone ? qfWinners[3]!.twitchUserId : null),
  ];

  const semifinals: BracketView['semifinals'] = [
    sfReady
      ? matchView(
          'sf-0',
          'Meias-Finais',
          '',
          qfWinners[0]!,
          qfWinners[1]!,
          sfDone ? sfWinners[0]!.twitchUserId : null,
        )
      : emptyMatch('sf-0', 'Meias-Finais', ''),
    sfReady
      ? matchView(
          'sf-1',
          'Meias-Finais',
          '',
          qfWinners[2]!,
          qfWinners[3]!,
          sfDone ? sfWinners[1]!.twitchUserId : null,
        )
      : emptyMatch('sf-1', 'Meias-Finais', ''),
  ];

  const final = finalReady
    ? matchView(
        'final-0',
        'Final',
        '',
        sfWinners[0]!,
        sfWinners[1]!,
        stage === 'champion' ? sfWinners[0]!.twitchUserId : null,
      )
    : emptyMatch('final-0', 'Final', '');

  return {
    stage,
    title: 'Bonus Tournament',
    quarterfinals,
    semifinals,
    final,
    champion: stage === 'champion' ? sfWinners[0]! : null,
  };
}

export function parseBracketDemoStage(raw: string | null | undefined): BracketDemoStage {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'after_qf' || v === 'after-qf') return 'after_qf';
  if (v === 'after_sf' || v === 'after-sf') return 'after_sf';
  if (v === 'final') return 'final';
  if (v === 'champion') return 'champion';
  return 'qf';
}

/** Compatibility helper for draw-result → initial QF tree. */
export function buildBracketTreeFromDraw(
  selected: DrawParticipant[],
  matchups: DrawMatchup[],
): BracketView {
  const qf = [0, 1, 2, 3].map((i) => {
    const m = matchups[i];
    return matchView(
      `qf-${i}`,
      'Quartos de Final',
      '',
      m?.playerA ?? selected[i * 2] ?? null,
      m?.playerB ?? selected[i * 2 + 1] ?? null,
      null,
    );
  }) as BracketView['quarterfinals'];

  return {
    stage: 'qf',
    title: 'Bonus Tournament',
    quarterfinals: qf,
    semifinals: [emptyMatch('sf-0', 'Meias-Finais', ''), emptyMatch('sf-1', 'Meias-Finais', '')],
    final: emptyMatch('final-0', 'Final', ''),
    champion: null,
  };
}

/** Convenience: demo tournament → live-projected bracket. */
export function bracketViewFromDemoStatus(
  status: 'qf' | 'sf' | 'final' | 'completed',
): BracketView {
  const demo = createDemoTournament(status === 'completed' ? 'completed' : status);
  return buildBracketViewFromDemo(demo, status === 'completed' ? 'champion' : 'live');
}
