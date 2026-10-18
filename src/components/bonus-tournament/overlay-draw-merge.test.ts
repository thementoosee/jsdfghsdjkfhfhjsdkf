import { describe, expect, it } from 'vitest';
import { mergeDrawSnapshots, resolveOverlayLivePack } from './BonusTournamentOverlayPreview';
import { createDemoTournament } from './demo-data';
import type { DrawPublicSnapshot } from './draw-types';

const snap = (version: number, phase: DrawPublicSnapshot['phase']): DrawPublicSnapshot => ({
  tournamentId: 't1',
  presentationId: 'p1',
  tournamentName: 'HUNT',
  version,
  eventId: `e${version}`,
  runStatus: phase === 'idle' ? 'idle' : 'running',
  phase,
  revealedPlayers: 0,
  revealedMatches: 0,
  countdownValue: phase === 'countdown' ? 3 : null,
  phaseStartedAt: phase === 'idle' ? null : new Date().toISOString(),
  phaseDurationMs: phase === 'idle' ? null : 1000,
  result: null,
  entriesClosed: true,
  uniqueEntryCount: 8,
  updatedAt: new Date().toISOString(),
});

describe('mergeDrawSnapshots / resolveOverlayLivePack', () => {
  it('prefers higher version from persisted draw over stale broadcast', () => {
    expect(mergeDrawSnapshots(snap(2, 'countdown'), snap(5, 'reveal_player'))?.version).toBe(5);
    expect(mergeDrawSnapshots(snap(5, 'reveal_player'), snap(2, 'countdown'))?.version).toBe(5);
  });

  it('ACTIVE tournament uses persisted draw without Dashboard broadcast', () => {
    const demo = { ...createDemoTournament('entries'), id: 'live-1', status: 'entries' as const };
    const pack = resolveOverlayLivePack(null, demo, snap(3, 'countdown'));
    expect(pack.liveSynced).toBe(true);
    expect(pack.drawSnapshot?.phase).toBe('countdown');
    expect(pack.drawSnapshot?.version).toBe(3);
  });
});
