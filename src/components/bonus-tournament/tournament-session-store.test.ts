import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_ENTRY_COUNT,
  createTournamentSession,
  deleteTournamentSession,
  getActiveTournamentId,
  listTournamentSessions,
  resetDemoTournamentSession,
  setActiveTournamentId,
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
  it('createTournamentSession seeds exactly 8 distinct fictícios', () => {
    const record = createTournamentSession({
      name: 'HUNT DOS REIS',
      chatCommand: '!torneio',
      prizePool: 250,
      durationMinutes: 15,
    });
    expect(record.demo.isDemo).toBe(true);
    expect(record.demo.status).toBe('entries');
    expect(record.demo.entriesConfig.entriesOpen).toBe(true);
    expect(record.demo.entries).toHaveLength(DEMO_ENTRY_COUNT);
    const ids = record.demo.entries.map((e) => e.twitchUserId);
    expect(new Set(ids).size).toBe(DEMO_ENTRY_COUNT);
    expect(record.demo.players).toHaveLength(0);
    expect(record.demo.matches).toHaveLength(0);
  });

  it('reset clears progression and restores 8 entries without new remote writes', () => {
    const created = createTournamentSession({
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

  it('deleteTournamentSession removes only the selected DEMO and clears active if needed', () => {
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
