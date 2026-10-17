import { useEffect, useState } from 'react';
import {
  buildDemoEntries,
  createDemoTournament,
  defaultEntriesConfig,
  getEntriesRemainingSeconds,
} from './demo-data';
import { hydrateDemoSlotsFromCatalog } from './hydrate-demo-slots';
import { BonusTournamentOverlay } from './BonusTournamentOverlay';
import type { BonusTournamentDemo, BonusTournamentEntry, BonusTournamentMatch } from './types';
import {
  subscribeRemoteLiveMirror,
  type TournamentRemoteMirrorPayload,
} from './tournament-remote-broadcast';
import { subscribeActiveRemoteTournament } from './tournament-remote-api';
import type { DrawPublicSnapshot } from './draw-types';

/** Neutral idle frame when nothing is ACTIVE — never stale DEMO fixtures. */
export function buildNeutralOverlayDemo(): BonusTournamentDemo {
  return {
    ...createDemoTournament('entries'),
    id: 'bt-neutral-idle',
    name: 'Bonus Tournament',
    status: 'entries',
    overlayView: 'overview',
    entries: [],
    players: [],
    matches: [],
    selectedMatchId: null,
    entriesConfig: defaultEntriesConfig({
      tournamentTitle: 'Bonus Tournament',
      prizePool: 0,
      durationSeconds: 0,
      timerStartedAt: null,
      timerPaused: true,
      remainingSecondsSnapshot: 0,
      entriesOpen: false,
    }),
  };
}

/**
 * Resolve overlay live data: ACTIVE (same-origin) → remote broadcast (OBS) →
 * local mirror only if it still matches ACTIVE → otherwise null (neutral).
 */
export function resolveOverlayLivePack(
  remote: TournamentRemoteMirrorPayload | null,
  dbActive: BonusTournamentDemo | null = null,
): {
  demo: BonusTournamentDemo | null;
  drawSnapshot: DrawPublicSnapshot | null;
  liveSynced: boolean;
} {
  // REAL: Supabase ACTIVE only (no localStorage / BroadcastChannel).
  if (dbActive) {
    return {
      demo: dbActive,
      drawSnapshot:
        remote?.sessionId === dbActive.id ? remote.drawSnapshot : null,
      liveSynced: true,
    };
  }

  if (remote?.sessionId && remote.demo && remote.demo.id === remote.sessionId) {
    return {
      demo: remote.demo,
      drawSnapshot: remote.drawSnapshot,
      liveSynced: true,
    };
  }

  return { demo: null, drawSnapshot: null, liveSynced: false };
}

/** OBS / preview overlay — ACTIVE tournament only (local or remote broadcast). */
export function BonusTournamentOverlayPreview() {
  const [remote, setRemote] = useState<TournamentRemoteMirrorPayload | null>(null);
  const [dbActive, setDbActive] = useState<BonusTournamentDemo | null>(null);
  const [demo, setDemo] = useState<BonusTournamentDemo>(() => {
    if (typeof window === 'undefined') return buildNeutralOverlayDemo();
    return resolveOverlayLivePack(null).demo ?? buildNeutralOverlayDemo();
  });
  const [drawSnapshot, setDrawSnapshot] = useState<DrawPublicSnapshot | null>(() => {
    if (typeof window === 'undefined') return null;
    return resolveOverlayLivePack(null).drawSnapshot;
  });
  const [liveSynced, setLiveSynced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return resolveOverlayLivePack(null).liveSynced;
  });
  /** Isolated preview controls only when nothing is ACTIVE / remote. */
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const sync = () => {
      const pack = resolveOverlayLivePack(remote, dbActive);
      if (pack.liveSynced && pack.demo) {
        setDemo(pack.demo);
        setDrawSnapshot(pack.drawSnapshot);
        setLiveSynced(true);
        setPreviewMode(false);
        return;
      }
      setLiveSynced(false);
      setDrawSnapshot(null);
      if (!previewMode) {
        setDemo(buildNeutralOverlayDemo());
      }
    };
    sync();
  }, [remote, dbActive, previewMode]);

  useEffect(() => {
    return subscribeRemoteLiveMirror((payload) => {
      setRemote(payload.sessionId ? payload : null);
    });
  }, []);

  useEffect(() => {
    return subscribeActiveRemoteTournament((t) => setDbActive(t));
  }, []);

  const revealNextPay = (side: 'A' | 'B', amount: number) => {
    setDemo((prev) => {
      const id = prev.selectedMatchId;
      if (!id) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.id !== id) return m;
          const key = side === 'A' ? 'buysA' : 'buysB';
          const buys = [...m[key]] as BonusTournamentMatch['buysA'];
          const idx = buys.findIndex((b) => b.pay === null);
          if (idx < 0) return m;
          buys[idx] = { pay: amount, realized: true };
          return { ...m, [key]: buys };
        }),
      };
    });
  };

  const enableLocalPreview = () => {
    if (liveSynced) return;
    setPreviewMode(true);
    void hydrateDemoSlotsFromCatalog(createDemoTournament('qf')).then((next) => {
      setDemo({ ...next, overlayView: 'duel' });
    });
  };

  const resetLiveBuys = () => {
    void hydrateDemoSlotsFromCatalog(createDemoTournament('qf')).then((next) => {
      setDemo({ ...next, overlayView: 'duel' });
    });
  };

  const showChampion = () => {
    void hydrateDemoSlotsFromCatalog(createDemoTournament('completed')).then((next) => {
      setDemo({ ...next, overlayView: 'overview' });
    });
  };

  const showEntries = (count: number, open = true) => {
    setPreviewMode(true);
    const entries = buildDemoEntries(count);
    setDemo({
      ...createDemoTournament('entries'),
      entries,
      entriesConfig: defaultEntriesConfig({
        tournamentTitle: 'HUNT DOS REIS',
        prizePool: 250,
        durationSeconds: 5 * 60,
        timerStartedAt: open ? Date.now() : null,
        timerPaused: false,
        remainingSecondsSnapshot: open ? null : 0,
        entriesOpen: open,
      }),
      status: 'entries',
      overlayView: 'entries',
      players: [],
      matches: [],
      selectedMatchId: null,
    });
  };

  const applyNumberScale = (scale: 'S' | 'M' | 'L') => {
    const fixtures = {
      S: { buyA: 0.4, buyB: 0.5, paysA: [6, 14, 10], paysB: [10, 8, 12] },
      M: { buyA: 100, buyB: 100, paysA: [250, 1250, 500], paysB: [250, 750, 1000] },
      L: { buyA: 1, buyB: 1, paysA: [12_500, 125_000, 1_250_000], paysB: [125_000, 250_000, 1_250_000] },
    } as const;
    const f = fixtures[scale];

    setDemo((prev) => {
      const id = prev.selectedMatchId;
      if (!id) return prev;
      return {
        ...prev,
        overlayView: 'duel' as const,
        matches: prev.matches.map((m) => {
          if (m.id !== id) return m;
          return {
            ...m,
            buyPriceA: f.buyA,
            buyPriceB: f.buyB,
            buysA: f.paysA.map((pay) => ({ pay, realized: true as const })) as typeof m.buysA,
            buysB: f.paysB.map((pay) => ({ pay, realized: true as const })) as typeof m.buysB,
          };
        }),
      };
    });
  };

  const addRandomEntry = () => {
    setDemo((prev) => {
      if (prev.overlayView !== 'entries' && prev.status !== 'entries') return prev;
      const n = prev.entries.length;
      const name = `NewViewer${n + 1}`;
      const next: BonusTournamentEntry = {
        id: `demo-e-live-${n + 1}`,
        twitchUserId: `demo_twitch_live_${2000 + n}`,
        displayName: name,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=f8fafc&size=128&bold=true&format=png`,
        enrolledAt: new Date().toISOString(),
      };
      return { ...prev, entries: [...prev.entries, next] };
    });
  };

  const pauseTimer = () => {
    setDemo((prev) => {
      const rem = getEntriesRemainingSeconds(prev.entriesConfig);
      return {
        ...prev,
        entriesConfig: {
          ...prev.entriesConfig,
          timerPaused: true,
          remainingSecondsSnapshot: rem,
        },
      };
    });
  };

  const resumeTimer = () => {
    setDemo((prev) => {
      const rem = prev.entriesConfig.remainingSecondsSnapshot ?? prev.entriesConfig.durationSeconds;
      return {
        ...prev,
        entriesConfig: {
          ...prev.entriesConfig,
          timerPaused: false,
          timerStartedAt: Date.now() - (prev.entriesConfig.durationSeconds - rem) * 1000,
          remainingSecondsSnapshot: null,
          entriesOpen: true,
        },
      };
    });
  };

  const closeEntries = () => {
    setDemo((prev) => {
      const rem = getEntriesRemainingSeconds(prev.entriesConfig);
      return {
        ...prev,
        entriesConfig: {
          ...prev.entriesConfig,
          entriesOpen: false,
          timerPaused: true,
          remainingSecondsSnapshot: rem,
        },
      };
    });
  };

  const btn = (active: boolean) => ({
    background: active ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.08)',
    color: active ? '#fbbf24' : '#e2e8f0',
    border: `1px solid ${active ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.15)'}`,
  });

  const isEntries = demo.overlayView === 'entries' || demo.status === 'entries';
  const showLocalControls = !liveSynced && previewMode;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: 'radial-gradient(ellipse at center, #1a2744, #070b14)' }}
    >
      <div>
        <div
          className="text-[10px] font-black tracking-widest uppercase mb-3 text-center"
          style={{ color: '#94a3b8' }}
        >
          {liveSynced
            ? 'Live sync · torneio ACTIVE · /bonus-tournament/overlay'
            : previewMode
              ? 'Preview isolado · /bonus-tournament/overlay · DEMO'
              : 'Sem torneio ACTIVE · estado neutro · /bonus-tournament/overlay'}
        </div>
        <BonusTournamentOverlay demo={demo} drawSnapshot={drawSnapshot} />
        <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-[520px] mx-auto">
          {liveSynced ? (
            <div
              className="w-full text-center text-[11px] font-bold"
              style={{ color: '#93c5fd' }}
            >
              Controlos locais desativados — a Dashboard é a fonte de verdade.
            </div>
          ) : !previewMode ? (
            <button
              type="button"
              onClick={enableLocalPreview}
              className="px-3 py-1 rounded text-[10px] font-bold uppercase"
              style={btn(false)}
            >
              Abrir preview DEMO local
            </button>
          ) : (
            <>
          <button type="button" onClick={() => setDemo((d) => ({ ...d, overlayView: 'overview', status: d.status === 'entries' ? 'qf' : d.status }))} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={btn(demo.overlayView === 'overview')}>
            Visão geral
          </button>
          <button type="button" onClick={resetLiveBuys} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={btn(demo.overlayView === 'duel' && demo.status === 'qf')}>
            Confronto
          </button>
          <button type="button" onClick={() => showEntries(18, true)} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={btn(isEntries)}>
            Inscrições
          </button>
          <button type="button" onClick={showChampion} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: demo.status === 'completed' ? 'rgba(251,191,36,0.2)' : 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.45)' }}>
            Campeão
          </button>

          {showLocalControls && !isEntries && (
            <>
              <button type="button" onClick={() => revealNextPay('A', 22)} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)' }}>
                Revelar PAY A
              </button>
              <button type="button" onClick={() => revealNextPay('B', 8)} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)' }}>
                Revelar PAY B
              </button>
              <button type="button" onClick={() => revealNextPay('A', 0)} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)' }}>
                Revelar €0 A
              </button>
              <button type="button" onClick={() => applyNumberScale('S')} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.35)' }}>
                Nums S
              </button>
              <button type="button" onClick={() => applyNumberScale('M')} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.35)' }}>
                Nums M
              </button>
              <button type="button" onClick={() => applyNumberScale('L')} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.35)' }}>
                Nums L
              </button>
            </>
          )}

          {showLocalControls && isEntries && (
            <>
              {[0, 3, 8, 18, 20, 50, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => showEntries(n, true)}
                  className="px-3 py-1 rounded text-[10px] font-bold uppercase"
                  style={{
                    background: demo.entries.length === n ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)',
                    color: demo.entries.length === n ? '#fbbf24' : '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  {n} inscritos
                </button>
              ))}
              <button type="button" onClick={addRandomEntry} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)' }}>
                +1 inscrito
              </button>
              <button type="button" onClick={pauseTimer} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)' }}>
                Pausar tempo
              </button>
              <button type="button" onClick={resumeTimer} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)' }}>
                Retomar tempo
              </button>
              <button type="button" onClick={closeEntries} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}>
                Encerrar
              </button>
            </>
          )}

          {showLocalControls && (
          <button type="button" onClick={resetLiveBuys} className="px-3 py-1 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)' }}>
            Reset compras
          </button>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
