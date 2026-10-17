import { useEffect, useMemo, useState } from 'react';
import { BonusTournamentBracketOverlay } from './BonusTournamentBracketOverlay';
import {
  BRACKET_OVERLAY_H,
  BRACKET_OVERLAY_W,
  buildBracketViewFromDemo,
  buildDemoBracketView,
  buildEmptyBracketView,
  parseBracketDemoStage,
  type BracketView,
} from './bracket-structure';
import {
  subscribeRemoteLiveMirror,
  type TournamentRemoteMirrorPayload,
} from './tournament-remote-broadcast';
import { subscribeActiveRemoteTournament } from './tournament-remote-api';
import type { BonusTournamentDemo } from './types';

/**
 * Resolve bracket view: ACTIVE from Supabase ALWAYS wins over ?stage= fixtures.
 * No localStorage. Fixtures only with ?stage= AND no ACTIVE.
 */
export function resolveBracketObsView(
  stageParam: string | null | undefined,
  remote?: TournamentRemoteMirrorPayload | null,
  dbActive?: BonusTournamentDemo | null,
): {
  view: BracketView;
  fromLiveSession: boolean;
} {
  let demo: BonusTournamentDemo | null = null;

  if (dbActive) {
    demo = dbActive;
  } else if (
    remote?.sessionId &&
    remote.demo &&
    remote.demo.id === remote.sessionId
  ) {
    demo = remote.demo;
  }

  if (demo) {
    return {
      view: buildBracketViewFromDemo(demo, 'live'),
      fromLiveSession: true,
    };
  }

  if (stageParam) {
    return {
      view: buildDemoBracketView(parseBracketDemoStage(stageParam)),
      fromLiveSession: false,
    };
  }

  return {
    view: buildEmptyBracketView(),
    fromLiveSession: false,
  };
}

/**
 * Read-only OBS Browser Source — center casino cutout 1288×720.
 */
export function BracketObsPage() {
  const stageParam = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('stage');
  }, []);

  const [remote, setRemote] = useState<TournamentRemoteMirrorPayload | null>(null);
  const [dbActive, setDbActive] = useState<BonusTournamentDemo | null>(null);
  const [pack, setPack] = useState(() => resolveBracketObsView(stageParam, null, null));

  useEffect(() => {
    setPack(resolveBracketObsView(stageParam, remote, dbActive));
  }, [stageParam, remote, dbActive]);

  useEffect(() => {
    return subscribeRemoteLiveMirror((payload) => {
      setRemote(payload.sessionId ? payload : null);
    });
  }, []);

  useEffect(() => {
    return subscribeActiveRemoteTournament((t) => setDbActive(t));
  }, []);

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#05080f' }}
    >
      <div style={{ width: BRACKET_OVERLAY_W, height: BRACKET_OVERLAY_H }}>
        <BonusTournamentBracketOverlay
          view={pack.view}
          demoBadge={!pack.fromLiveSession}
        />
      </div>
    </div>
  );
}
