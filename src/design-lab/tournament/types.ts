export type RoundId = 'r16' | 'qf' | 'sf' | 'final' | 'champion';

export type ParticipantStatus = 'waiting' | 'playing' | 'advanced' | 'eliminated' | 'champion';

export interface LabParticipant {
  id: string;
  name: string;
  seed: number;
  avatarHue: number;
}

export interface LabMatch {
  id: string;
  round: RoundId;
  index: number;
  a: LabParticipant;
  b: LabParticipant;
  scoreA?: number;
  scoreB?: number;
  winnerId?: string;
  status: 'upcoming' | 'live' | 'done';
}

export type LabPhase =
  | 'intro'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'final'
  | 'champion';

export const ROUND_LABEL: Record<RoundId, string> = {
  r16: 'OITAVOS',
  qf: 'QUARTOS',
  sf: 'MEIAS',
  final: 'FINAL',
  champion: 'CAMPEÃO',
};

export const PHASE_ORDER: LabPhase[] = ['intro', 'r16', 'qf', 'sf', 'final', 'champion'];
