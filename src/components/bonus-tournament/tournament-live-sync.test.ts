import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBracketObsView } from './BracketObsPage';
import {
  buildElimHoldDemo,
  overlaySceneKey,
  shouldOverlaySceneFade,
} from './BonusTournamentOverlay';
import {
  buildNeutralOverlayDemo,
  resolveOverlayLivePack,
} from './BonusTournamentOverlayPreview';
import { createDemoTournament } from './demo-data';
import {
  clearLiveMirror,
  readLiveMirror,
  writeLiveMirror,
} from './tournament-live-mirror';
import {
  activateTournamentSession,
  createDemoTournamentSession,
  createTournamentSession,
  setActiveTournamentId,
} from './tournament-session-store';
import type { DrawPublicSnapshot } from './draw-types';

const KEYS = [
  'bt-tournament-sessions-v1',
  'bt-tournament-active-id-v1',
  'bt-tournament-live-mirror-v1',
];
const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  const ls = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  };
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', {
    localStorage: ls,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  });
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      postMessage() {}
      close() {}
    },
  );
});

afterEach(() => {
  for (const k of KEYS) memory.delete(k);
  vi.unstubAllGlobals();
});

describe('resolveBracketObsView — live session wins over fixtures', () => {
  it('uses fixtures only when no active session and no mirror', () => {
    const pack = resolveBracketObsView('after_sf');
    expect(pack.fromLiveSession).toBe(false);
    expect(pack.view.stage).toBe('after_sf');
    expect(pack.view.semifinals.some((m) => m.playerA.participant !== null)).toBe(true);
  });

  it('uses Supabase ACTIVE (dbActive) even when ?stage= requests a fixture', () => {
    const record = createTournamentSession({
      name: 'LIVE HUNT',
      chatCommand: '!torneio',
      prizePool: 250,
      durationMinutes: 15,
    });
    // Local ACTIVE alone must NOT drive OBS REAL path
    setActiveTournamentId(record.id);
    const localOnly = resolveBracketObsView('champion', null, null);
    expect(localOnly.fromLiveSession).toBe(false);

    const pack = resolveBracketObsView('champion', null, record.demo);
    expect(pack.fromLiveSession).toBe(true);
    expect(pack.view.title).toBe('LIVE HUNT');
    expect(
      pack.view.quarterfinals.every(
        (m) => m.playerA.participant === null && m.playerB.participant === null,
      ),
    ).toBe(true);
    expect(pack.view.champion).toBeNull();
  });

  it('ignores stale live mirror when nothing is ACTIVE', () => {
    const demo = createDemoTournament('qf');
    writeLiveMirror({ sessionId: demo.id, demo, drawSnapshot: null });
    setActiveTournamentId(null);

    const pack = resolveBracketObsView('final');
    expect(pack.fromLiveSession).toBe(false);
    expect(pack.view.stage).toBe('final');
  });

  it('uses remote broadcast payload when no local ACTIVE (OBS path)', () => {
    const demo = createDemoTournament('qf');
    const remote = {
      sessionId: demo.id,
      demo,
      drawSnapshot: null,
      updatedAt: Date.now(),
    };
    const pack = resolveBracketObsView(null, remote);
    expect(pack.fromLiveSession).toBe(true);
    expect(pack.view.title).toBe(
      demo.entriesConfig.tournamentTitle || demo.name,
    );
    expect(pack.view.quarterfinals[0]?.playerA.participant?.displayName).toBeTruthy();
  });

  it('empty bracket when no ACTIVE, no remote, no stage', () => {
    const pack = resolveBracketObsView(null);
    expect(pack.fromLiveSession).toBe(false);
    expect(
      pack.view.quarterfinals.every(
        (m) => m.playerA.participant === null && m.playerB.participant === null,
      ),
    ).toBe(true);
  });

  it('clears mirror so fixtures return after hub exit', () => {
    const demo = createDemoTournament('qf');
    writeLiveMirror({ sessionId: demo.id, demo });
    clearLiveMirror();
    expect(readLiveMirror().demo).toBeNull();
    const pack = resolveBracketObsView('qf');
    expect(pack.fromLiveSession).toBe(false);
  });
});

describe('resolveOverlayLivePack — ACTIVE only', () => {
  it('returns null when nothing is ACTIVE even if mirror has DEMO fixtures', () => {
    const demo = createDemoTournament('qf');
    writeLiveMirror({ sessionId: demo.id, demo, drawSnapshot: null });
    setActiveTournamentId(null);
    const pack = resolveOverlayLivePack(null);
    expect(pack.liveSynced).toBe(false);
    expect(pack.demo).toBeNull();
  });

  it('uses dbActive Supabase row (not localStorage)', () => {
    const record = createDemoTournamentSession({
      name: 'LIVE',
      chatCommand: '!t',
      prizePool: 100,
      durationMinutes: 10,
    });
    activateTournamentSession(record.id);
    const live = { ...record.demo, status: 'qf' as const };
    writeLiveMirror({ sessionId: record.id, demo: live, drawSnapshot: null });
    // Local ACTIVE + mirror ignored for REAL overlay resolution
    expect(resolveOverlayLivePack(null, null).liveSynced).toBe(false);
    const pack = resolveOverlayLivePack(null, live);
    expect(pack.liveSynced).toBe(true);
    expect(pack.demo?.id).toBe(record.id);
    expect(pack.demo?.status).toBe('qf');
  });

  it('uses ephemeral remote broadcast when no db ACTIVE', () => {
    const demo = createDemoTournament('sf');
    const pack = resolveOverlayLivePack({
      sessionId: demo.id,
      demo,
      drawSnapshot: null,
      updatedAt: Date.now(),
    });
    expect(pack.liveSynced).toBe(true);
    expect(pack.demo?.status).toBe('sf');
  });

  it('buildNeutralOverlayDemo has no players/matches', () => {
    const n = buildNeutralOverlayDemo();
    expect(n.players).toHaveLength(0);
    expect(n.matches).toHaveLength(0);
    expect(n.entries).toHaveLength(0);
  });
});

describe('overlaySceneKey / shouldOverlaySceneFade', () => {
  const drawSnap = (phase: DrawPublicSnapshot['phase']): DrawPublicSnapshot => ({
    tournamentId: 't1',
    presentationId: 'p1',
    tournamentName: 'TEST',
    version: 1,
    eventId: 'e1',
    runStatus: phase === 'idle' ? 'idle' : 'completed',
    phase,
    revealedPlayers: 8,
    revealedMatches: 0,
    countdownValue: null,
    phaseStartedAt: null,
    phaseDurationMs: null,
    result: null,
    entriesClosed: true,
    uniqueEntryCount: 8,
    updatedAt: new Date().toISOString(),
  });

  it('keeps the same key when only PAY / buys change', () => {
    const a = createDemoTournament('qf');
    const b = {
      ...a,
      matches: a.matches.map((m, i) =>
        i === 0
          ? {
              ...m,
              buysA: [{ id: '1', amount: 50, multi: 10, revealed: true }],
            }
          : m,
      ),
    };
    expect(overlaySceneKey(a, 'duel', null)).toBe(overlaySceneKey(b, 'duel', null));
  });

  it('changes key when selected match advances', () => {
    const demo = createDemoTournament('qf');
    const qf = demo.matches.filter((m) => m.round === 'qf');
    const first = { ...demo, selectedMatchId: qf[0]!.id, overlayView: 'duel' as const };
    const second = { ...demo, selectedMatchId: qf[1]!.id, overlayView: 'duel' as const };
    expect(overlaySceneKey(first, 'duel', null)).not.toBe(overlaySceneKey(second, 'duel', null));
    expect(
      shouldOverlaySceneFade(
        overlaySceneKey(first, 'duel', null),
        overlaySceneKey(second, 'duel', null),
      ),
    ).toBe(true);
  });

  it('fades draw → first duel', () => {
    expect(shouldOverlaySceneFade('draw', 'duel:qf-0')).toBe(true);
  });

  it('does not fade identical keys', () => {
    expect(shouldOverlaySceneFade('duel:qf-0', 'duel:qf-0')).toBe(false);
  });

  it('draw scene key while ceremony snapshot is live', () => {
    const demo = { ...createDemoTournament('draw'), overlayView: 'draw' as const, status: 'draw' as const };
    expect(overlaySceneKey(demo, 'draw', drawSnap('matchups'))).toBe('draw');
  });

  it('buildElimHoldDemo freezes outgoing duel with winner before champion', () => {
    const done = createDemoTournament('completed');
    const hold = buildElimHoldDemo(done, 'duel:final-0');
    expect(hold).not.toBeNull();
    expect(hold!.selectedMatchId).toBe('final-0');
    expect(hold!.status).toBe('final');
    expect(hold!.overlayView).toBe('duel');
    const final = hold!.matches.find((m) => m.id === 'final-0');
    expect(final?.confirmedWinnerId).toBeTruthy();
  });
});
