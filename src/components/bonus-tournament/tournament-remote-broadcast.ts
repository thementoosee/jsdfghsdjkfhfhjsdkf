/**
 * Cross-browser / OBS live mirror via Supabase Realtime Broadcast.
 * No DB table / migration required — ephemeral channel payloads.
 *
 * Same-origin still uses localStorage (tournament-live-mirror).
 * OBS Browser Source (isolated profile) relies on this channel.
 */

import { supabase } from '../../lib/supabase';
import type { DrawPublicSnapshot } from './draw-types';
import type { BonusTournamentDemo } from './types';

export const BT_LIVE_CHANNEL = 'bt-tournament-live-v1';
export const BT_LIVE_EVENT = 'mirror';

export type TournamentRemoteMirrorPayload = {
  sessionId: string | null;
  demo: BonusTournamentDemo | null;
  drawSnapshot: DrawPublicSnapshot | null;
  updatedAt: number;
};

type Listener = (payload: TournamentRemoteMirrorPayload) => void;

let publishChannel: ReturnType<typeof supabase.channel> | null = null;
let lastPayload: TournamentRemoteMirrorPayload | null = null;
let heartbeatTimer: number | null = null;

function emptyPayload(): TournamentRemoteMirrorPayload {
  return { sessionId: null, demo: null, drawSnapshot: null, updatedAt: Date.now() };
}

async function ensurePublishChannel() {
  if (publishChannel) return publishChannel;
  const ch = supabase.channel(BT_LIVE_CHANNEL, {
    config: { broadcast: { self: false } },
  });
  await new Promise<void>((resolve) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        resolve();
      }
    });
  });
  publishChannel = ch;
  return ch;
}

/** Publish ACTIVE tournament state (or clear). Dashboard only. */
export async function publishRemoteLiveMirror(partial: {
  sessionId: string | null;
  demo: BonusTournamentDemo | null;
  drawSnapshot?: DrawPublicSnapshot | null;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  const next: TournamentRemoteMirrorPayload = {
    sessionId: partial.sessionId,
    demo: partial.demo,
    drawSnapshot:
      partial.drawSnapshot !== undefined
        ? partial.drawSnapshot
        : (lastPayload?.drawSnapshot ?? null),
    updatedAt: Date.now(),
  };
  lastPayload = next;
  try {
    const ch = await ensurePublishChannel();
    await ch.send({
      type: 'broadcast',
      event: BT_LIVE_EVENT,
      payload: next,
    });
  } catch {
    /* network / realtime unavailable — local mirror still works same-origin */
  }
}

export function clearRemoteLiveMirror(): void {
  void publishRemoteLiveMirror({ sessionId: null, demo: null, drawSnapshot: null });
}

/** Keep late OBS joiners fed while a tournament is ACTIVE. */
export function startRemoteLiveHeartbeat(getPayload: () => TournamentRemoteMirrorPayload | null): () => void {
  stopRemoteLiveHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    const p = getPayload();
    if (!p) return;
    void publishRemoteLiveMirror(p);
  }, 2000);
  return stopRemoteLiveHeartbeat;
}

export function stopRemoteLiveHeartbeat(): void {
  if (heartbeatTimer != null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** Subscribe to remote ACTIVE mirror (OBS / second browser). */
export function subscribeRemoteLiveMirror(onChange: Listener): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const ch = supabase.channel(`${BT_LIVE_CHANNEL}-sub-${Math.random().toString(36).slice(2, 9)}`, {
    config: { broadcast: { self: true } },
  });

  ch.on('broadcast', { event: BT_LIVE_EVENT }, ({ payload }) => {
    const p = payload as TournamentRemoteMirrorPayload;
    if (!p || typeof p !== 'object') return;
    onChange({
      sessionId: p.sessionId ?? null,
      demo: p.demo ?? null,
      drawSnapshot: p.drawSnapshot ?? null,
      updatedAt: p.updatedAt ?? Date.now(),
    });
  });

  ch.subscribe();

  return () => {
    void supabase.removeChannel(ch);
  };
}

export function getLastRemotePayload(): TournamentRemoteMirrorPayload | null {
  return lastPayload;
}

export { emptyPayload as emptyRemoteLivePayload };
