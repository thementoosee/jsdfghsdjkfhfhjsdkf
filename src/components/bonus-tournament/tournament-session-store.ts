/**
 * Local cache / offline draft for Bonus Tournament dashboard.
 * Live source of truth: Supabase `bonus_tournaments` (+ entries) when migration applied.
 * localStorage remains a same-browser cache and DEMO-only sandbox.
 */

import type { BonusTournamentDemo, BonusTournamentEntriesConfig } from './types';
import { buildDemoEntries, defaultEntriesConfig } from './demo-data';

/** Fixed DEMO roster size for automated tests / explicit dev fixtures only. */
export const DEMO_ENTRY_COUNT = 8;

const STORAGE_KEY = 'bt-tournament-sessions-v1';
const ACTIVE_KEY = 'bt-tournament-active-id-v1';
const CHANNEL = 'bt-tournament-session-sync';

export type TournamentSessionRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  demo: BonusTournamentDemo;
};

export type TournamentSessionStore = {
  sessions: TournamentSessionRecord[];
  activeId: string | null;
};

function emptyStore(): TournamentSessionStore {
  return { sessions: [], activeId: null };
}

function readRaw(): TournamentSessionStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const activeId = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return { sessions: [], activeId };
    const parsed = JSON.parse(raw) as { sessions?: TournamentSessionRecord[] };
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeId,
    };
  } catch {
    return emptyStore();
  }
}

function writeRaw(store: TournamentSessionStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: store.sessions }));
  if (store.activeId) window.localStorage.setItem(ACTIVE_KEY, store.activeId);
  else window.localStorage.removeItem(ACTIVE_KEY);
  try {
    window.dispatchEvent(
      new CustomEvent('bt-tournament-session', { detail: { activeId: store.activeId } }),
    );
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'sync', activeId: store.activeId, at: Date.now() });
    bc.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

export function listTournamentSessions(): TournamentSessionRecord[] {
  return readRaw().sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getActiveTournamentId(): string | null {
  return readRaw().activeId;
}

export function getTournamentSession(id: string): TournamentSessionRecord | null {
  return readRaw().sessions.find((s) => s.id === id) ?? null;
}

export function getActiveTournamentSession(): TournamentSessionRecord | null {
  const store = readRaw();
  if (!store.activeId) return null;
  return store.sessions.find((s) => s.id === store.activeId) ?? null;
}

export function setActiveTournamentId(id: string | null): void {
  const store = readRaw();
  store.activeId = id;
  writeRaw(store);
}

/**
 * Mark exactly one tournament as ACTIVE for OBS overlays.
 * Does not mutate tournament data. Pass null to clear ACTIVE.
 */
export function activateTournamentSession(id: string | null): {
  ok: boolean;
  reason?: 'not_found';
} {
  if (id === null) {
    setActiveTournamentId(null);
    return { ok: true };
  }
  const store = readRaw();
  if (!store.sessions.some((s) => s.id === id)) {
    return { ok: false, reason: 'not_found' };
  }
  store.activeId = id;
  writeRaw(store);
  return { ok: true };
}

/** Persist session data WITHOUT changing which tournament is ACTIVE. */
export function upsertTournamentSession(demo: BonusTournamentDemo): TournamentSessionRecord {
  const store = readRaw();
  const now = new Date().toISOString();
  const existing = store.sessions.find((s) => s.id === demo.id);
  let record: TournamentSessionRecord;
  if (existing) {
    record = { ...existing, updatedAt: now, demo };
    store.sessions = store.sessions.map((s) => (s.id === demo.id ? record : s));
  } else {
    record = { id: demo.id, createdAt: now, updatedAt: now, demo };
    store.sessions = [record, ...store.sessions];
  }
  // Never auto-activate on create/save — ACTIVE is an explicit admin action.
  writeRaw(store);
  return record;
}

function buildSessionShell(args: {
  name: string;
  chatCommand: string;
  prizePool: number;
  durationMinutes: number;
  isDemo: boolean;
  entries: BonusTournamentDemo['entries'];
}): TournamentSessionRecord {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `bt-${Date.now()}`;
  const title = args.name.trim() || 'Bonus Tournament';
  const cmd = args.chatCommand.trim().startsWith('!')
    ? args.chatCommand.trim()
    : `!${args.chatCommand.trim() || 'torneio'}`;
  const durationSeconds = Math.max(60, Math.round(args.durationMinutes * 60));
  const entriesConfig: BonusTournamentEntriesConfig = defaultEntriesConfig({
    tournamentTitle: title,
    chatCommand: cmd,
    prizePool: Math.max(0, args.prizePool),
    durationSeconds,
    timerStartedAt: Date.now(),
    timerPaused: false,
    remainingSecondsSnapshot: null,
    entriesOpen: true,
  });

  const demo: BonusTournamentDemo = {
    id,
    name: title,
    isDemo: args.isDemo,
    status: 'entries',
    entries: args.entries,
    entriesConfig,
    players: [],
    matches: [],
    selectedMatchId: null,
    overlayView: 'entries',
  };

  return upsertTournamentSession(demo);
}

/** REAL tournament — empty roster; Twitch EventSub fills bonus_tournament_entries. */
export function createTournamentSession(args: {
  name: string;
  chatCommand: string;
  prizePool: number;
  durationMinutes: number;
}): TournamentSessionRecord {
  return buildSessionShell({ ...args, isDemo: false, entries: [] });
}

/**
 * Explicit DEMO sandbox for vitest / local stress only.
 * Never use as the default create path for live.
 */
export function createDemoTournamentSession(args: {
  name: string;
  chatCommand: string;
  prizePool: number;
  durationMinutes: number;
}): TournamentSessionRecord {
  return buildSessionShell({
    ...args,
    isDemo: true,
    entries: buildDemoEntries(DEMO_ENTRY_COUNT),
  });
}

/**
 * Reset an existing DEMO session to entries + fresh 8 fictícios.
 * Keeps title / command / prize / duration. Clears draw, slots, pays, winners.
 * Refuses non-demo records.
 */
export function resetDemoTournamentSession(demo: BonusTournamentDemo): TournamentSessionRecord {
  if (!demo.isDemo) {
    throw new Error('resetDemoTournamentSession: only DEMO sessions may be reset');
  }
  const durationSeconds = demo.entriesConfig.durationSeconds;
  const next: BonusTournamentDemo = {
    ...demo,
    status: 'entries',
    entries: buildDemoEntries(DEMO_ENTRY_COUNT),
    entriesConfig: {
      ...demo.entriesConfig,
      timerStartedAt: Date.now(),
      timerPaused: false,
      remainingSecondsSnapshot: null,
      entriesOpen: true,
      durationSeconds,
    },
    players: [],
    matches: [],
    selectedMatchId: null,
    overlayView: 'entries',
  };
  return upsertTournamentSession(next);
}

export function saveTournamentDemo(demo: BonusTournamentDemo): void {
  upsertTournamentSession(demo);
}

/**
 * Delete a local cache session. Remote delete is handled separately via API.
 */
export function deleteTournamentSession(id: string): {
  deleted: boolean;
  wasActive: boolean;
  reason?: 'not_found';
} {
  const store = readRaw();
  const record = store.sessions.find((s) => s.id === id);
  if (!record) return { deleted: false, wasActive: false, reason: 'not_found' };
  const wasActive = store.activeId === id;
  store.sessions = store.sessions.filter((s) => s.id !== id);
  if (wasActive) store.activeId = null;
  writeRaw(store);
  return { deleted: true, wasActive };
}

export function subscribeTournamentSessions(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === ACTIVE_KEY) onChange();
  };
  const onLocal = () => onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener('bt-tournament-session', onLocal);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => onChange();
  } catch {
    bc = null;
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('bt-tournament-session', onLocal);
    bc?.close();
  };
}

/** Active / in-progress = not completed. */
export function isTournamentInProgress(demo: BonusTournamentDemo): boolean {
  return demo.status !== 'completed';
}

export function tabForStatus(
  status: BonusTournamentDemo['status'],
): 'overview' | 'entries' | 'draw' | 'matchups' | 'champion' {
  if (status === 'preparation' || status === 'entries') return 'entries';
  if (status === 'draw') return 'draw';
  if (status === 'qf' || status === 'sf' || status === 'final') return 'matchups';
  if (status === 'completed') return 'champion';
  return 'overview';
}
