import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDemoTournamentSession,
  createTournamentSession,
  deleteTournamentSession,
  listTournamentSessions,
  pruneNonDemoSessionsNotInRemote,
  saveTournamentDemo,
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

describe('pruneNonDemoSessionsNotInRemote', () => {
  it('removes non-demo local ghosts missing from remote list', () => {
    const live = createTournamentSession({
      name: 'LIVE',
      chatCommand: '!torneio',
      prizePool: 100,
      durationMinutes: 15,
    });
    const ghost = createTournamentSession({
      name: 'GHOST',
      chatCommand: '!torneio',
      prizePool: 100,
      durationMinutes: 15,
    });
    createDemoTournamentSession({
      name: 'DEMO',
      chatCommand: '!demo',
      prizePool: 50,
      durationMinutes: 10,
    });

    const { removed } = pruneNonDemoSessionsNotInRemote([live.id]);
    expect(removed).toContain(ghost.id);
    expect(removed).not.toContain(live.id);
    const sessions = listTournamentSessions();
    expect(sessions.find((s) => s.id === live.id)).toBeTruthy();
    expect(sessions.find((s) => s.id === ghost.id)).toBeUndefined();
    expect(sessions.some((s) => s.demo.isDemo)).toBe(true);
  });

  it('local delete without remote prune lets remount restore — documenting prior bug', () => {
    const t = createTournamentSession({
      name: 'X',
      chatCommand: '!x',
      prizePool: 1,
      durationMinutes: 5,
    });
    expect(deleteTournamentSession(t.id).deleted).toBe(true);
    expect(listTournamentSessions().find((s) => s.id === t.id)).toBeUndefined();
    // Simulate remount rehydrate from remote list still containing the row
    saveTournamentDemo(t.demo);
    expect(listTournamentSessions().find((s) => s.id === t.id)).toBeTruthy();
  });
});
