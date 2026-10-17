import { useEffect, useState } from 'react';
import { DrawSidebarOverlay } from './DrawSidebarOverlay';
import {
  fetchDrawState,
  probeDrawSync,
  subscribeDrawState,
  type DrawSyncStatus,
} from './draw-sync';
import type { DrawPublicSnapshot } from './draw-types';
import { toPublicSnapshot } from './draw-types';
import { fetchActiveRemoteTournament } from './tournament-remote-api';
import { getActiveTournamentId, subscribeTournamentSessions } from './tournament-session-store';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';

/**
 * Read-only OBS Browser Source — SIDEBAR 288×720 draw ceremony.
 * Follows ACTIVE tournament id (remote preferred, local cache fallback).
 * Never issues admin commands.
 */
export function DrawObsPage() {
  const [snapshot, setSnapshot] = useState<DrawPublicSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<DrawSyncStatus>('unknown');
  const [detail, setDetail] = useState<string | undefined>();
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolveId = async () => {
      const remote = await fetchActiveRemoteTournament();
      if (cancelled) return;
      if (remote.ok && remote.row?.id) {
        setTournamentId(remote.row.id);
        return;
      }
      setTournamentId(getActiveTournamentId());
    };
    void resolveId();
    const unsub = subscribeTournamentSessions(() => {
      void resolveId();
    });
    const poll = window.setInterval(() => {
      void resolveId();
    }, 5000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!tournamentId) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const probe = await probeDrawSync();
      if (cancelled) return;
      setSyncStatus(probe.status);
      setDetail(probe.detail);
      if (probe.status !== 'ready') return;

      const load = async () => {
        const remote = await fetchDrawState(tournamentId);
        if (cancelled) return;
        setSyncStatus(remote.status);
        setDetail(remote.detail);
        if (remote.state) {
          setSnapshot((prev) => {
            const next = toPublicSnapshot(remote.state!);
            if (prev && next.version < prev.version) return prev;
            return next;
          });
        }
      };

      await load();
      if (cancelled) return;

      const sub = subscribeDrawState(tournamentId, (snap) => {
        setSnapshot((prev) => {
          if (prev && snap.version < prev.version) return prev;
          if (prev && snap.version === prev.version && snap.eventId === prev.eventId) return prev;
          return snap;
        });
      });
      unsubscribe = sub.unsubscribe;
      poll = setInterval(() => {
        void load();
      }, 4000);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (poll) clearInterval(poll);
    };
  }, [tournamentId]);

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#05080f' }}
    >
      <div className="relative">
        <DrawSidebarOverlay snapshot={snapshot} />
        {(syncStatus !== 'ready' || !tournamentId) && (
          <div
            className="absolute bottom-2 left-2 right-2 text-center text-[9px] font-bold uppercase tracking-wider"
            style={{ color: '#64748b' }}
          >
            {!tournamentId
              ? 'Sem torneio ACTIVE'
              : detail || syncStatus}
          </div>
        )}
      </div>
      {/* layout anchor for OBS source size */}
      <div style={{ width: MAIN_OVERLAY_SIDEBAR_WIDTH_PX, height: 0 }} aria-hidden />
    </div>
  );
}
