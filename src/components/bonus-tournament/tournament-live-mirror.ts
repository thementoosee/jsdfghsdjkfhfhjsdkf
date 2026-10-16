/**
 * Live mirror for OBS / second-window overlays (same origin).
 * Carries the active DEMO session + optional draw snapshot.
 * Not for cross-device sync (that needs Supabase).
 */

import type { DrawPublicSnapshot } from './draw-types';
import type { BonusTournamentDemo } from './types';

const MIRROR_KEY = 'bt-tournament-live-mirror-v1';
const CHANNEL = 'bt-tournament-live-mirror';

export type TournamentLiveMirror = {
  sessionId: string | null;
  demo: BonusTournamentDemo | null;
  drawSnapshot: DrawPublicSnapshot | null;
  updatedAt: number;
};

function emptyMirror(): TournamentLiveMirror {
  return { sessionId: null, demo: null, drawSnapshot: null, updatedAt: 0 };
}

export function readLiveMirror(): TournamentLiveMirror {
  if (typeof window === 'undefined') return emptyMirror();
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    if (!raw) return emptyMirror();
    const parsed = JSON.parse(raw) as TournamentLiveMirror;
    return {
      sessionId: parsed.sessionId ?? null,
      demo: parsed.demo ?? null,
      drawSnapshot: parsed.drawSnapshot ?? null,
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return emptyMirror();
  }
}

export function writeLiveMirror(partial: {
  sessionId: string | null;
  demo: BonusTournamentDemo | null;
  drawSnapshot?: DrawPublicSnapshot | null;
}): void {
  if (typeof window === 'undefined') return;
  const prev = readLiveMirror();
  const next: TournamentLiveMirror = {
    sessionId: partial.sessionId,
    demo: partial.demo,
    drawSnapshot:
      partial.drawSnapshot !== undefined ? partial.drawSnapshot : prev.drawSnapshot,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(MIRROR_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent('bt-live-mirror', { detail: next.updatedAt }));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'mirror', at: next.updatedAt });
    bc.close();
  } catch {
    /* ignore */
  }
}

export function clearLiveMirror(): void {
  writeLiveMirror({ sessionId: null, demo: null, drawSnapshot: null });
}

export function subscribeLiveMirror(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === MIRROR_KEY) onChange();
  };
  const onLocal = () => onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener('bt-live-mirror', onLocal);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => onChange();
  } catch {
    bc = null;
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('bt-live-mirror', onLocal);
    bc?.close();
  };
}
