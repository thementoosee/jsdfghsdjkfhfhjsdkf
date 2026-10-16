export type BonusTournamentStatus =
  | 'preparation'
  | 'entries'
  | 'draw'
  | 'qf'
  | 'sf'
  | 'final'
  | 'completed';

/** Active rounds — tournament starts at quarterfinals (8 players). */
export type BonusTournamentRound = 'qf' | 'sf' | 'final';

/**
 * One of the three bonus opens for a side.
 * - realized=false: buy not yet taken (not counted in tournament GASTO).
 * - realized=true & pay=null: taken, awaiting PAY (provisional P/L).
 * - realized=true & pay=number (incl. 0): result registered.
 */
export interface BonusTournamentBuy {
  pay: number | null;
  realized: boolean;
}

/**
 * Expected total opens in an 8-player bracket:
 * QF 4×2×3 + SF 2×2×3 + Final 1×2×3 = 42.
 */
export const TOURNAMENT_TOTAL_BUYS = 42;

export interface BonusTournamentPlayer {
  id: string;
  twitchUserId: string;
  displayName: string;
  /** Demo avatar URL — not live Twitch API in Phase 1 */
  avatarUrl: string;
  /** Slot is fixed for the whole tournament (not per round). */
  slotName: string;
  slotImage: string;
}

/**
 * Enrollment record (pre-draw). Unique identity = twitchUserId.
 * Prepared for future Twitch !torneio — no live API in Phase 1.
 */
export interface BonusTournamentEntry {
  id: string;
  twitchUserId: string;
  displayName: string;
  avatarUrl: string;
  /** ISO timestamp of enrollment */
  enrolledAt: string;
}

/** DEMO / future panel settings for the entries overlay. */
export interface BonusTournamentEntriesConfig {
  /** Custom title shown under BONUS TOURNAMENT during entries only */
  tournamentTitle: string;
  prizePool: number;
  /** Chat command shown on the entries overlay (Twitch integration later). */
  chatCommand: string;
  /** Total registration window length (seconds) */
  durationSeconds: number;
  /** Epoch ms when the countdown started; null = not started */
  timerStartedAt: number | null;
  timerPaused: boolean;
  /** Remaining seconds when paused (or when closed) */
  remainingSecondsSnapshot: number | null;
  /** When false: show INSCRIÇÕES ENCERRADAS / aguarda sorteio */
  entriesOpen: boolean;
}

/**
 * BUY price is per match/side — admin sets it each round.
 * It is NOT carried automatically from a previous round.
 * All 3 opens on that side share buyPriceA / buyPriceB.
 */
export interface BonusTournamentMatch {
  id: string;
  round: BonusTournamentRound;
  index: number;
  playerAId: string;
  playerBId: string;
  /** Unit BUY for player A in THIS match only (all 3 opens). */
  buyPriceA: number | null;
  /** Unit BUY for player B in THIS match only (all 3 opens). */
  buyPriceB: number | null;
  buysA: [BonusTournamentBuy, BonusTournamentBuy, BonusTournamentBuy];
  buysB: [BonusTournamentBuy, BonusTournamentBuy, BonusTournamentBuy];
  /** Set only after admin confirm (demo). Auto-suggest may differ. */
  confirmedWinnerId: string | null;
  status: 'pending' | 'live' | 'done';
}

export interface BonusTournamentDemo {
  id: string;
  name: string;
  isDemo: true;
  status: BonusTournamentStatus;
  /**
   * Unique enrolled participants (may be >8).
   * Visual carousel may repeat these — counter never counts duplicates.
   */
  entries: BonusTournamentEntry[];
  /** Entries overlay settings (title, prize, timer). */
  entriesConfig: BonusTournamentEntriesConfig;
  /** Drawn 8 (or fewer during early statuses). */
  players: BonusTournamentPlayer[];
  matches: BonusTournamentMatch[];
  selectedMatchId: string | null;
  overlayView: 'overview' | 'duel' | 'entries' | 'draw';
}

export const STATUS_LABEL: Record<BonusTournamentStatus, string> = {
  preparation: 'Preparação',
  entries: 'Inscrições',
  draw: 'Sorteio',
  qf: 'Quartos',
  sf: 'Meias',
  final: 'Final',
  completed: 'Concluído',
};

export const ROUND_LABEL: Record<BonusTournamentRound, string> = {
  qf: 'QUARTOS',
  sf: 'MEIAS',
  final: 'FINAL',
};

export const STATUS_FLOW: BonusTournamentStatus[] = [
  'preparation',
  'entries',
  'draw',
  'qf',
  'sf',
  'final',
  'completed',
];
