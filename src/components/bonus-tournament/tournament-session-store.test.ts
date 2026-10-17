import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_ENTRY_COUNT,
  activateTournamentSession,
  createDemoTournamentSession,
  createTournamentSession,
  deleteTournamentSession,
  getActiveTournamentId,
  listTournamentSessions,
  resetDemoTournamentSession,
  setActiveTournamentId,
  upsertTournamentSession,
} from './tournament-session-store';

const KEYS = ['bt-tournament-sessions-v1', 'bt-tournament-active-id-v1'];
const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  });
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

afterEach(() => {
  for (const k of KEYS) memory.delete(k);
  vi.unstubAllGlobals();
});

describe('tournament-session-store DEMO roster', () => {
  it('createTournamentSession is REAL — empty roster, not DEMO', () => {
    const record = createTournamentSession({
      name: 'HUNT DOS REIS',
      chatCommand: '!torneio',
      prizePool: 250,
      durationMinutes: 15,
    });
    expect(record.demo.isDemo).toBe(false);
    expect(record.demo.status).toBe('entries');
    expect(record.demo.entriesConfig.entriesOpen).toBe(true);
    expect(record.demo.entries).toHaveLength(0);
    expect(record.demo.players).toHaveLength(0);
    expect(record.demo.matches).toHaveLength(0);
  });

  it('createDemoTournamentSession seeds exactly 8 distinct fictícios (dev/tests only)', () => {
    const record = createDemoTournamentSession({
      name: 'HUNT DOS REIS',
      chatCommand: '!torneio',
      prizePool: 250,
      durationMinutes: 15,
    });
    expect(record.demo.isDemo).toBe(true);
    expect(record.demo.entries).toHaveLength(DEMO_ENTRY_COUNT);
    const ids = record.demo.entries.map((e) => e.twitchUserId);
    expect(new Set(ids).size).toBe(DEMO_ENTRY_COUNT);
  });

  it('reset clears progression and restores 8 entries without new remote writes', () => {
    const created = createDemoTournamentSession({
      name: 'TEST',
      chatCommand: '!x',
      prizePool: 100,
      durationMinutes: 10,
    });
    created.demo.status = 'qf';
    created.demo.players = [
      {
        id: 'x',
        twitchUserId: 'x',
        displayName: 'X',
        avatarUrl: '',
        slotName: 'Slot',
        slotImage: '',
      },
    ];
    created.demo.matches = [
      {
        id: 'qf-0',
        round: 'qf',
        index: 0,
        playerAId: 'x',
        playerBId: 'x',
        buyPriceA: 1,
        buyPriceB: 1,
        buysA: [
          { pay: 10, realized: true },
          { pay: null, realized: false },
          { pay: null, realized: false },
        ],
        buysB: [
          { pay: null, realized: false },
          { pay: null, realized: false },
          { pay: null, realized: false },
        ],
        confirmedWinnerId: 'x',
        status: 'done',
      },
    ];

    const reset = resetDemoTournamentSession(created.demo);
    expect(reset.demo.status).toBe('entries');
    expect(reset.demo.entries).toHaveLength(DEMO_ENTRY_COUNT);
    expect(reset.demo.players).toHaveLength(0);
    expect(reset.demo.matches).toHaveLength(0);
    expect(reset.demo.entriesConfig.entriesOpen).toBe(true);
    expect(reset.demo.entriesConfig.tournamentTitle).toBe(created.demo.entriesConfig.tournamentTitle);
    expect(listTournamentSessions().some((s) => s.id === reset.id)).toBe(true);
  });

  it('createTournamentSession does not auto-activate', () => {
    expect(getActiveTournamentId()).toBeNull();
    const a = createTournamentSession({
      name: 'A',
      chatCommand: '!a',
      prizePool: 100,
      durationMinutes: 10,
    });
    expect(getActiveTournamentId()).toBeNull();
    upsertTournamentSession({ ...a.demo, name: 'A2' });
    expect(getActiveTournamentId()).toBeNull();
  });

  it('activateTournamentSession is exclusive and clearable', () => {
    const a = createTournamentSession({
      name: 'A',
      chatCommand: '!a',
      prizePool: 100,
      durationMinutes: 10,
    });
    const b = createTournamentSession({
      name: 'B',
      chatCommand: '!b',
      prizePool: 200,
      durationMinutes: 15,
    });
    expect(activateTournamentSession(a.id).ok).toBe(true);
    expect(getActiveTournamentId()).toBe(a.id);
    expect(activateTournamentSession(b.id).ok).toBe(true);
    expect(getActiveTournamentId()).toBe(b.id);
    expect(activateTournamentSession(null).ok).toBe(true);
    expect(getActiveTournamentId()).toBeNull();
  });

  it('deleteTournamentSession removes the selected session and clears active if needed', () => {
    const a = createTournamentSession({
      name: 'KEEP',
      chatCommand: '!a',
      prizePool: 100,
      durationMinutes: 10,
    });
    const b = createTournamentSession({
      name: 'DELETE ME',
      chatCommand: '!b',
      prizePool: 200,
      durationMinutes: 15,
    });
    setActiveTournamentId(b.id);
    expect(getActiveTournamentId()).toBe(b.id);

    const result = deleteTournamentSession(b.id);
    expect(result.deleted).toBe(true);
    expect(result.wasActive).toBe(true);
    expect(getActiveTournamentId()).toBeNull();
    const ids = listTournamentSessions().map((s) => s.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);

    const again = deleteTournamentSession(b.id);
    expect(again.deleted).toBe(false);
    expect(again.reason).toBe('not_found');
  });
});
