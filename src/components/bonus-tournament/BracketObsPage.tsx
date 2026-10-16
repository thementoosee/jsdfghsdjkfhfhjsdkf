import { useEffect, useMemo, useState } from 'react';
import { BonusTournamentBracketOverlay } from './BonusTournamentBracketOverlay';
import {
  BRACKET_OVERLAY_H,
  BRACKET_OVERLAY_W,
  buildBracketViewFromDemo,
  buildDemoBracketView,
  parseBracketDemoStage,
  type BracketView,
} from './bracket-structure';
import {
  getActiveTournamentSession,
  subscribeTournamentSessions,
} from './tournament-session-store';
import { readLiveMirror, subscribeLiveMirror } from './tournament-live-mirror';

/**
 * Resolve bracket view: active live session ALWAYS wins over ?stage= fixtures.
 * Fixtures only when there is no active tournament session.
 */
export function resolveBracketObsView(stageParam: string | null | undefined): {
  view: BracketView;
  fromLiveSession: boolean;
} {
  const active = getActiveTournamentSession();
  const mirror = readLiveMirror();
  // Prefer active session store; fall back to live mirror (same-origin OBS tabs).
  const demo =
    active?.demo ??
    (mirror.demo && (!mirror.sessionId || mirror.demo.id === mirror.sessionId) ? mirror.demo : null);

  if (demo) {
    return {
      view: buildBracketViewFromDemo(demo, 'live'),
      fromLiveSession: true,
    };
  }

  return {
    view: buildDemoBracketView(parseBracketDemoStage(stageParam)),
    fromLiveSession: false,
  };
}

/**
 * Read-only OBS Browser Source — center casino cutout 1288×720.
 * Live session from Dashboard takes priority; ?stage= is preview-only fallback.
 */
export function BracketObsPage() {
  const stageParam = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('stage');
  }, []);

  const [pack, setPack] = useState(() => resolveBracketObsView(stageParam));

  useEffect(() => {
    const sync = () => setPack(resolveBracketObsView(stageParam));
    sync();
    const unsubSession = subscribeTournamentSessions(sync);
    const unsubMirror = subscribeLiveMirror(sync);
    return () => {
      unsubSession();
      unsubMirror();
    };
  }, [stageParam]);

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
