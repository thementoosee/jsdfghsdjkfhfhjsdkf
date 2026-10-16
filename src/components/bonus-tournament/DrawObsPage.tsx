import { useEffect, useState } from 'react';
import { DrawSidebarOverlay } from './DrawSidebarOverlay';
import {
  DEMO_DRAW_TOURNAMENT_ID,
  fetchDrawState,
  probeDrawSync,
  subscribeDrawState,
  type DrawSyncStatus,
} from './draw-sync';
import type { DrawPublicSnapshot } from './draw-types';
import { toPublicSnapshot } from './draw-types';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';

/**
 * Read-only OBS Browser Source — SIDEBAR 288×720 draw ceremony.
 * Never issues admin commands.
 */
export function DrawObsPage() {
  const [snapshot, setSnapshot] = useState<DrawPublicSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<DrawSyncStatus>('unknown');
  const [detail, setDetail] = useState<string | undefined>();

  useEffect(() => {
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
        const remote = await fetchDrawState(DEMO_DRAW_TOURNAMENT_ID);
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

      const sub = subscribeDrawState(DEMO_DRAW_TOURNAMENT_ID, (snap) => {
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
  }, []);

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#05080f' }}
    >
      <div className="relative">
        <DrawSidebarOverlay snapshot={snapshot} />
        {syncStatus !== 'ready' && (
          <div
            className="absolute left-2 bottom-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(15,23,42,0.85)',
              color: '#94a3b8',
              maxWidth: MAIN_OVERLAY_SIDEBAR_WIDTH_PX - 16,
            }}
            title={detail}
          >
            Sync {syncStatus}
          </div>
        )}
      </div>
    </div>
  );
}
