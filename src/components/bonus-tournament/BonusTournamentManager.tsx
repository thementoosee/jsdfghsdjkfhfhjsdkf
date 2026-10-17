import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Trophy,
  Users,
  Swords,
  Eye,
  CheckCircle2,
  LayoutDashboard,
  Dices,
  MonitorPlay,
  Copy,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Plus,
  Crown,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  buildDemoEntries,
  getEntriesRemainingSeconds,
  matchesForRound,
  playerMap,
} from './demo-data';
import { DrawManagerPanel } from './DrawManagerPanel';
import { BonusTournamentOverlay } from './BonusTournamentOverlay';
import {
  calcMulti,
  calcSideStats,
  formatAvg,
  formatMoney,
  formatMulti,
  isSameConfirmedPay,
  parsePayInput,
  suggestWinner,
} from './scoring';
import { SlotThumb } from './SlotThumb';
import type { DrawPublicSnapshot } from './draw-types';
import type { BonusTournamentDemo, BonusTournamentMatch } from './types';
import { ROUND_LABEL, STATUS_LABEL } from './types';
import {
  activateTournamentSession,
  createDemoTournamentSession,
  createTournamentSession,
  deleteTournamentSession,
  DEMO_ENTRY_COUNT,
  getActiveTournamentId,
  getActiveTournamentSession,
  isTournamentInProgress,
  listTournamentSessions,
  resetDemoTournamentSession,
  saveTournamentDemo,
  subscribeTournamentSessions,
  tabForStatus,
  type TournamentSessionRecord,
} from './tournament-session-store';
import { clearLiveMirror, writeLiveMirror } from './tournament-live-mirror';
import {
  clearRemoteLiveMirror,
  publishRemoteLiveMirror,
  startRemoteLiveHeartbeat,
} from './tournament-remote-broadcast';
import {
  activateRemoteTournament,
  refreshRemoteAvatars,
  seedRemoteTestEntries,
  removeRemoteTestEntries,
  createRemoteTournament,
  deleteRemoteTournament,
  listRemoteTournaments,
  persistRemoteTournamentState,
  probeTournamentRemote,
  rowToTournament,
  subscribeRemoteEntries,
  type RemoteBackendStatus,
} from './tournament-remote-api';
import {
  applyDrawLaunchToDemo,
  confirmWinnerAndAdvance,
  isMatchPlayable,
  PENDING_PLAYER_ID,
} from './match-progression';
import { formatEntriesTimer } from './entries-carousel';
import { countBtTestEntries, isBtTestTwitchUserId } from './bt-test-entries';

type ManagerTab = 'overview' | 'entries' | 'draw' | 'matchups' | 'champion' | 'overlays';
type ShellView = 'hub' | 'create' | 'workspace';

const TABS: { id: ManagerTab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Visão Geral', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'entries', label: 'Inscrições', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'draw', label: 'Sorteio', icon: <Dices className="w-3.5 h-3.5" /> },
  { id: 'matchups', label: 'Confrontos', icon: <Swords className="w-3.5 h-3.5" /> },
  { id: 'champion', label: 'Campeão', icon: <Crown className="w-3.5 h-3.5" /> },
  { id: 'overlays', label: 'Overlays OBS', icon: <MonitorPlay className="w-3.5 h-3.5" /> },
];

const ui = {
  page: '#0f0f0f',
  card: '#26262b',
  cardBorder: 'rgba(82, 82, 91, 0.7)',
  input: '#1e1e24',
  inputBorder: '#3a3a44',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentGrad: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
  danger: '#ef4444',
  headerGrad: 'linear-gradient(135deg, rgba(22, 22, 26, 0.96) 0%, rgba(28, 28, 34, 0.94) 100%)',
} as const;

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${className}`}
      style={{ background: ui.card, borderColor: ui.cardBorder }}
    >
      {children}
    </section>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-3 rounded-xl text-sm font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-40 ${className}`}
      style={{ background: ui.accentGrad, color: '#fff' }}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  active,
  danger,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-40 ${className}`}
      style={{
        background: active ? 'rgba(59,130,246,0.18)' : '#1e1e24',
        border: `1px solid ${active ? 'rgba(96,165,250,0.45)' : ui.inputBorder}`,
        color: danger ? '#f87171' : active ? ui.accentSoft : '#e2e8f0',
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase" style={{ color: ui.muted }}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputStyle = {
  background: ui.input,
  border: `1px solid ${ui.inputBorder}`,
  color: ui.text,
} as const;

function tabAllowed(demo: BonusTournamentDemo, tab: ManagerTab): boolean {
  if (tab === 'overview' || tab === 'overlays') return true;
  if (tab === 'entries') return true;
  if (tab === 'draw') return !demo.entriesConfig.entriesOpen || demo.status === 'draw' || demo.status === 'qf' || demo.status === 'sf' || demo.status === 'final' || demo.status === 'completed';
  if (tab === 'matchups') {
    return demo.status === 'qf' || demo.status === 'sf' || demo.status === 'final' || demo.status === 'completed';
  }
  if (tab === 'champion') return demo.status === 'completed';
  return true;
}

export function BonusTournamentManager() {
  const [shell, setShell] = useState<ShellView>('hub');
  const [sessions, setSessions] = useState<TournamentSessionRecord[]>([]);
  const [demo, setDemo] = useState<BonusTournamentDemo | null>(null);
  const [drawSnapshot, setDrawSnapshot] = useState<DrawPublicSnapshot | null>(null);
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Create form
  const [createName, setCreateName] = useState('HUNT DOS REIS');
  const [createCmd, setCreateCmd] = useState('!torneio');
  const [createPrize, setCreatePrize] = useState(250);
  const [createMins, setCreateMins] = useState(15);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TournamentSessionRecord | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteBackendStatus>('unknown');
  const [remoteDetail, setRemoteDetail] = useState<string | undefined>();
  const remoteVersionRef = useRef(0);
  const [creating, setCreating] = useState(false);
  /** Admin writes go through same-origin /api/bt-admin — no manual codes. */
  const operatorUnlocked = remoteStatus === 'ready';

  const refreshSessions = useCallback(() => {
    setSessions(listTournamentSessions());
  }, []);

  useEffect(() => {
    refreshSessions();
    return subscribeTournamentSessions(refreshSessions);
  }, [refreshSessions]);

  // Probe live tables + Dashboard admin proxy; load full list when ready.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const probe = await probeTournamentRemote();
      if (cancelled) return;
      setRemoteStatus(probe.status);
      setRemoteDetail(probe.detail);

      if (probe.status === 'ready') {
        const listed = await listRemoteTournaments();
        if (cancelled || !listed.ok) return;
        for (const row of listed.rows) {
          const pack = await import('./tournament-remote-api').then((m) =>
            m.fetchRemoteTournament(row.id),
          );
          const entries = pack.ok ? pack.entries : [];
          saveTournamentDemo(rowToTournament(row, entries));
          if (row.is_active) {
            activateTournamentSession(row.id);
            remoteVersionRef.current = row.state_version;
          }
        }
        refreshSessions();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions]);

  const activeTournamentId = getActiveTournamentId();
  const isWorkspaceActive = Boolean(demo && activeTournamentId === demo.id);

  // Persist local cache; remote CAS when live + admin; OBS mirror only when ACTIVE
  useEffect(() => {
    if (!demo) {
      refreshSessions();
      return;
    }
    saveTournamentDemo(demo);
    const activeId = getActiveTournamentId();
    if (activeId === demo.id) {
      writeLiveMirror({
        sessionId: demo.id,
        demo,
        drawSnapshot,
      });
      void publishRemoteLiveMirror({
        sessionId: demo.id,
        demo,
        drawSnapshot,
      });
    }
    if (
      (remoteStatus === 'ready' || remoteStatus === 'needs_operator') &&
      operatorUnlocked &&
      !demo.isDemo
    ) {
      const expected = remoteVersionRef.current;
      void persistRemoteTournamentState(demo, expected).then((res) => {
        if (res.ok && res.row) remoteVersionRef.current = res.row.state_version;
        if (res.conflict && res.row) remoteVersionRef.current = res.row.state_version;
      });
    }
    refreshSessions();
  }, [demo, drawSnapshot, refreshSessions, remoteStatus, operatorUnlocked]);

  // Live Twitch entries for REAL tournaments
  useEffect(() => {
    if (!demo || demo.isDemo) return;
    if (remoteStatus !== 'ready' && remoteStatus !== 'needs_operator') return;
    return subscribeRemoteEntries(demo.id, (entries) => {
      setDemo((p) => {
        if (!p || p.id !== demo.id) return p;
        if (p.entries.length === entries.length && p.entries.every((e, i) => e.id === entries[i]?.id)) {
          return p;
        }
        return { ...p, entries };
      });
    });
  }, [demo?.id, demo?.isDemo, remoteStatus]);

  // Heartbeat for OBS joiners while any tournament is ACTIVE (workspace or hub)
  useEffect(() => {
    const activeId = getActiveTournamentId();
    if (!activeId) return;
    return startRemoteLiveHeartbeat(() => {
      const active = getActiveTournamentSession();
      if (!active) return null;
      if (demo && demo.id === active.id) {
        return {
          sessionId: demo.id,
          demo,
          drawSnapshot,
          updatedAt: Date.now(),
        };
      }
      return {
        sessionId: active.id,
        demo: active.demo,
        drawSnapshot: null,
        updatedAt: Date.now(),
      };
    });
  }, [demo, drawSnapshot, sessions, activeTournamentId]);

  const goHub = () => {
    setShell('hub');
    setDemo(null);
    setDrawSnapshot(null);
    // Keep ACTIVE as-is — leaving the workspace must not deactivate overlays.
    refreshSessions();
  };

  const handleActivate = (id: string) => {
    const result = activateTournamentSession(id);
    if (!result.ok) return;
    if (remoteStatus === 'ready' || remoteStatus === 'needs_operator') {
      if (!operatorUnlocked) {
        alert('Admin remoto indisponível. Verifica o proxy /api/bt-admin e as Edge secrets.');
        return;
      }
      void activateRemoteTournament(id).then(async (res) => {
        if (!res.ok) {
          alert(res.error || 'Falha ao ACTIVAR no Supabase.');
          return;
        }
        // Best-effort: refresh generic avatars for already-enrolled viewers.
        void refreshRemoteAvatars(id);
      });
    }
    const record = listTournamentSessions().find((s) => s.id === id);
    if (record) {
      writeLiveMirror({
        sessionId: record.id,
        demo: record.demo,
        drawSnapshot: demo?.id === id ? drawSnapshot : null,
      });
      void publishRemoteLiveMirror({
        sessionId: record.id,
        demo: record.demo,
        drawSnapshot: demo?.id === id ? drawSnapshot : null,
      });
    }
    refreshSessions();
  };

  const handleDeactivate = () => {
    activateTournamentSession(null);
    if ((remoteStatus === 'ready' || remoteStatus === 'needs_operator') && operatorUnlocked) {
      void activateRemoteTournament(null);
    }
    clearLiveMirror();
    clearRemoteLiveMirror();
    refreshSessions();
  };

  // Entries timer tick for dashboard display
  useEffect(() => {
    if (!demo || demo.status !== 'entries') return;
    if (!demo.entriesConfig.entriesOpen || demo.entriesConfig.timerPaused) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [demo?.status, demo?.entriesConfig.entriesOpen, demo?.entriesConfig.timerPaused]);

  const players = useMemo(() => (demo ? playerMap(demo) : {}), [demo]);
  const selected = demo?.matches.find((m) => m.id === demo.selectedMatchId) ?? null;
  const currentRoundMatches = useMemo(() => {
    if (!demo) return [];
    if (demo.status === 'qf' || demo.status === 'sf' || demo.status === 'final') {
      return matchesForRound(demo, demo.status).filter((m) => isMatchPlayable(m, players));
    }
    return [];
  }, [demo, players]);

  const openSession = (record: TournamentSessionRecord) => {
    setDemo(record.demo);
    // Do not auto-ACTIVAR — overlays follow explicit ACTIVE only.
    setShell('workspace');
    setTab(tabForStatus(record.demo.status));
  };

  const onDrawSnapshotChange = useCallback((snap: DrawPublicSnapshot | null) => {
    setDrawSnapshot(snap);
  }, []);

  const onDrawPhaseActive = useCallback((active: boolean) => {
    setDemo((p) => {
      if (!p) return p;
      if (active) {
        if (p.overlayView === 'draw' && p.status === 'draw') return p;
        return { ...p, status: 'draw', overlayView: 'draw' };
      }
      return p;
    });
  }, []);

  const handleLaunchMatchups = useCallback((snap: DrawPublicSnapshot) => {
    if (!snap.result) return;
    setDemo((p) => {
      if (!p) return p;
      return applyDrawLaunchToDemo(p, snap.result!);
    });
    setTab('matchups');
  }, []);

  const activeSessions = sessions.filter((s) => isTournamentInProgress(s.demo));
  const historySessions = sessions.filter((s) => s.demo.status === 'completed');

  if (shell === 'hub') {
    return (
      <div className="space-y-5 min-w-0">
        <div
          className="rounded-3xl border px-5 py-6 sm:px-6"
          style={{ background: ui.headerGrad, borderColor: ui.cardBorder }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: ui.accentSoft }}>
            Management
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Trophy className="w-6 h-6" style={{ color: ui.accentSoft }} />
            <h1 className="text-2xl font-black uppercase" style={{ color: ui.text }}>
              Bonus Tournament
            </h1>
          </div>
          <p className="text-sm mt-2" style={{ color: ui.muted }}>
            Torneios REAL · ACTIVAR envia para OBS · inscritos via comando Twitch
          </p>
          <p className="text-[11px] mt-2 font-bold" style={{ color: remoteStatus === 'missing_tables' ? '#fbbf24' : '#4ade80' }}>
            Backend: {remoteDetail || remoteStatus}
            {operatorUnlocked ? ' · admin pronto' : ''}
          </p>
          <div className="mt-5">
            <PrimaryBtn onClick={() => setShell('create')}>
              <Plus className="w-4 h-4" /> Começar torneio
            </PrimaryBtn>
          </div>
        </div>

        {activeSessions.length > 0 && (
          <Card className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: ui.muted }}>
              Em curso · ACTIVE controla as overlays OBS
            </div>
            {activeSessions.map((s) => (
              <SessionRow
                key={s.id}
                record={s}
                isActive={getActiveTournamentId() === s.id}
                onContinue={() => openSession(s)}
                onActivate={() => handleActivate(s.id)}
                onDeactivate={handleDeactivate}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </Card>
        )}

        <Card className="space-y-3">
          <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: ui.muted }}>
            Histórico
          </div>
          {historySessions.length === 0 ? (
            <p className="text-sm" style={{ color: ui.muted }}>
              Ainda não há torneios concluídos neste browser.
            </p>
          ) : (
            historySessions.map((s) => (
              <SessionRow
                key={s.id}
                record={s}
                isActive={getActiveTournamentId() === s.id}
                onContinue={() => openSession(s)}
                onActivate={() => handleActivate(s.id)}
                onDeactivate={handleDeactivate}
                onDelete={() => setDeleteTarget(s)}
              />
            ))
          )}
        </Card>

        {deleteTarget && (
          <DeleteTournamentModal
            record={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              const id = deleteTarget.id;
              const wasDemo = deleteTarget.demo.isDemo;
              const result = deleteTournamentSession(id);
              if (result.deleted && result.wasActive) {
                clearLiveMirror();
                clearRemoteLiveMirror();
                setDemo(null);
                setDrawSnapshot(null);
                if (operatorUnlocked) void activateRemoteTournament(null);
              }
              if (!wasDemo && operatorUnlocked) {
                void deleteRemoteTournament(id);
              }
              setDeleteTarget(null);
              refreshSessions();
            }}
          />
        )}
      </div>
    );
  }

  if (shell === 'create') {
    return (
      <div className="space-y-5 min-w-0 max-w-2xl">
        <GhostBtn onClick={goHub}>
          <ArrowLeft className="w-3.5 h-3.5" /> Visão geral
        </GhostBtn>
        <Card className="space-y-4">
          <h2 className="text-lg font-black uppercase" style={{ color: ui.text }}>
            Configurar torneio
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome do torneio">
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                style={inputStyle}
                placeholder="HUNT DOS REIS"
              />
            </Field>
            <Field label="Comando de inscrição">
              <input
                value={createCmd}
                onChange={(e) => setCreateCmd(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                style={inputStyle}
                placeholder="!torneio"
              />
            </Field>
            <Field label="Prize pool (€)">
              <input
                type="number"
                min={0}
                value={createPrize}
                onChange={(e) => setCreatePrize(Number(e.target.value) || 0)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                style={inputStyle}
              />
            </Field>
            <Field label="Duração das inscrições (min)">
              <div className="flex flex-wrap gap-2 mb-2">
                {[10, 15, 20, 30].map((m) => (
                  <GhostBtn key={m} active={createMins === m} onClick={() => setCreateMins(m)}>
                    {m} min
                  </GhostBtn>
                ))}
              </div>
              <input
                type="number"
                min={1}
                value={createMins}
                onChange={(e) => setCreateMins(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                style={inputStyle}
              />
            </Field>
          </div>
          <div className="text-xs font-bold space-y-1" style={{ color: ui.muted }}>
            <div>
              Participantes: <span style={{ color: ui.text }}>reais via Twitch</span> · sorteio de 8
            </div>
            <div>
              O torneio <span style={{ color: ui.text }}>não</span> fica ACTIVE ao criar — usa ACTIVAR
              para as overlays.
            </div>
          </div>
          {createError && (
            <div className="text-sm font-bold" style={{ color: '#f87171' }}>
              {createError}
            </div>
          )}
          <PrimaryBtn
            disabled={creating}
            onClick={() => {
              void (async () => {
                const name = createName.trim();
                const cmd = createCmd.trim();
                if (!name) {
                  setCreateError('Indique o nome do torneio.');
                  return;
                }
                if (!cmd) {
                  setCreateError('Indique o comando de inscrição.');
                  return;
                }
                if (!Number.isFinite(createPrize) || createPrize < 0) {
                  setCreateError('Prize pool inválido.');
                  return;
                }
                if (!Number.isFinite(createMins) || createMins < 1) {
                  setCreateError('Duração inválida.');
                  return;
                }
                setCreateError(null);
                setCreating(true);
                try {
                  if (remoteStatus === 'ready' || remoteStatus === 'needs_operator') {
                    if (!operatorUnlocked) {
                      setCreateError(
                        'Admin remoto indisponível. Verifica o proxy /api/bt-admin e as Edge secrets.',
                      );
                      return;
                    }
                    const remote = await createRemoteTournament({
                      name,
                      chatCommand: cmd,
                      prizePool: createPrize,
                      durationMinutes: createMins,
                    });
                    if (!remote.ok || !remote.row) {
                      setCreateError(remote.error || 'Falha ao criar torneio remoto.');
                      return;
                    }
                    remoteVersionRef.current = remote.row.state_version;
                    const record = {
                      id: remote.row.id,
                      createdAt: remote.row.created_at,
                      updatedAt: remote.row.updated_at,
                      demo: rowToTournament(remote.row, []),
                    };
                    saveTournamentDemo(record.demo);
                    openSession(record);
                    return;
                  }
                  const record = createTournamentSession({
                    name,
                    chatCommand: cmd,
                    prizePool: createPrize,
                    durationMinutes: createMins,
                  });
                  openSession(record);
                } finally {
                  setCreating(false);
                }
              })();
            }}
          >
            {creating ? 'A criar…' : 'Abrir inscrições'}
          </PrimaryBtn>
          {import.meta.env.DEV && (
            <GhostBtn
              onClick={() => {
                const record = createDemoTournamentSession({
                  name: `${createName.trim() || 'DEMO'} (dev)`,
                  chatCommand: createCmd.trim() || '!torneio',
                  prizePool: createPrize,
                  durationMinutes: createMins,
                });
                openSession(record);
              }}
            >
              Criar DEMO local (só desenvolvimento)
            </GhostBtn>
          )}
        </Card>
      </div>
    );
  }

  if (!demo) {
    return (
      <div className="space-y-4">
        <p style={{ color: ui.muted }}>Sem sessão ativa.</p>
        <PrimaryBtn onClick={goHub}>Voltar à visão geral</PrimaryBtn>
      </div>
    );
  }

  const entriesClosed = !demo.entriesConfig.entriesOpen;
  const remaining = getEntriesRemainingSeconds(demo.entriesConfig, now);
  const canGoDraw = entriesClosed;

  const confirmPay = (side: 'A' | 'B', buyIndex: number, raw: string): boolean => {
    if (!selected) return false;
    const value = parsePayInput(raw);
    if (value === undefined) {
      alert('Valor de PAY inválido');
      return false;
    }
    const key = side === 'A' ? 'buysA' : 'buysB';
    const current = selected[key][buyIndex];
    if (current && isSameConfirmedPay(current.pay, value)) return true;
    setDemo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.id !== selected.id) return m;
          const nextBuys = [...m[key]] as BonusTournamentMatch['buysA'];
          nextBuys[buyIndex] = { pay: value, realized: true };
          return {
            ...m,
            [key]: nextBuys,
            confirmedWinnerId: null,
            status: m.status === 'done' ? 'live' : m.status,
          };
        }),
      };
    });
    return true;
  };

  const updateBuyPrice = (side: 'A' | 'B', raw: string) => {
    if (!selected) return;
    const value = parsePayInput(raw);
    if (value === undefined) return;
    const priceKey = side === 'A' ? 'buyPriceA' : 'buyPriceB';
    setDemo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.id !== selected.id) return m;
          return {
            ...m,
            [priceKey]: value,
            confirmedWinnerId: null,
            status: m.status === 'done' ? 'live' : m.status,
          };
        }),
      };
    });
  };

  const confirmWinner = () => {
    if (!selected) return;
    const suggested = suggestWinner({
      playerAId: selected.playerAId,
      playerBId: selected.playerBId,
      buyPriceA: selected.buyPriceA,
      buyPriceB: selected.buyPriceB,
      buysA: selected.buysA,
      buysB: selected.buysB,
    });
    if (!suggested) {
      alert('Não é possível confirmar: dados incompletos ou empate sem desempate automático.');
      return;
    }
    setDemo((prev) => (prev ? confirmWinnerAndAdvance(prev, selected.id, suggested) : prev));
  };

  const suggested =
    selected &&
    suggestWinner({
      playerAId: selected.playerAId,
      playerBId: selected.playerBId,
      buyPriceA: selected.buyPriceA,
      buyPriceB: selected.buyPriceB,
      buysA: selected.buysA,
      buysB: selected.buysB,
    });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const entriesObsUrl = `${origin}/bonus-tournament/overlay`;
  const drawObsUrl = `${origin}/bonus-tournament/draw`;
  const bracketObsUrl = `${origin}/bonus-tournament/bracket`;
  const bracketPreviewUrl = `${origin}/bonus-tournament/bracket-preview`;

  const copyUrl = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl(null), 1800);
    });
  };

  const champion =
    demo.status === 'completed'
      ? demo.matches.find((m) => m.round === 'final' && m.confirmedWinnerId)
      : null;
  const championPlayer = champion?.confirmedWinnerId
    ? players[champion.confirmedWinnerId]
    : null;

  const trySetTab = (next: ManagerTab) => {
    if (next === 'draw' && !canGoDraw && demo.status === 'entries') {
      alert('Encerre as inscrições antes de ir ao sorteio.');
      return;
    }
    if (!tabAllowed(demo, next) && next === 'matchups') {
      alert('Apresente os duelos (SEGUINTE) e clique COMEÇAR CONFRONTOS antes desta página.');
      return;
    }
    if (next === 'champion' && demo.status !== 'completed') {
      alert('O campeão só fica disponível após a final.');
      return;
    }
    setTab(next);
  };

  return (
    <div className="space-y-5 min-w-0">
      <div
        className="rounded-3xl border px-5 py-5 sm:px-6"
        style={{ background: ui.headerGrad, borderColor: ui.cardBorder }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <GhostBtn onClick={goHub}>
                <ArrowLeft className="w-3.5 h-3.5" /> Visão geral
              </GhostBtn>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: ui.accentSoft }}>
              Management
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Trophy className="w-5 h-5" style={{ color: ui.accentSoft }} />
              <h1 className="text-2xl font-black uppercase truncate" style={{ color: ui.text }}>
                {demo.entriesConfig.tournamentTitle || demo.name}
              </h1>
              <span
                className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(59,130,246,0.18)',
                  color: ui.accentSoft,
                  border: '1px solid rgba(96,165,250,0.35)',
                }}
              >
                {STATUS_LABEL[demo.status]}
              </span>
              {demo.isDemo && (
                <span
                  className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(251,191,36,0.4)',
                  }}
                >
                  DEMO
                </span>
              )}
              {isWorkspaceActive ? (
                <span
                  className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
                  style={{
                    background: 'rgba(74,222,128,0.18)',
                    color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.4)',
                  }}
                >
                  Active · overlays
                </span>
              ) : (
                <span
                  className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: ui.muted,
                    border: `1px solid ${ui.inputBorder}`,
                  }}
                >
                  Não active
                </span>
              )}
            </div>
            <p className="text-sm mt-2" style={{ color: ui.muted }}>
              {demo.isDemo
                ? 'Sandbox DEMO local · não grava no Supabase'
                : 'Torneio REAL · overlays só seguem ACTIVE · inscritos via Twitch'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isWorkspaceActive ? (
              <GhostBtn onClick={handleDeactivate}>Desativar overlays</GhostBtn>
            ) : (
              <PrimaryBtn className="!py-2 !text-[11px]" onClick={() => handleActivate(demo.id)}>
                Activar nas overlays
              </PrimaryBtn>
            )}
            {demo.isDemo && (
              <GhostBtn
                danger
                onClick={() => {
                  if (
                    !confirm(
                      'REINICIAR TORNEIO DEMO?\n\nLimpa sorteio, slots, pagamentos e vencedores deste torneio DEMO e volta às inscrições com 8 jogadores fictícios.\n\nNão apaga outros torneios nem dados remotos.',
                    )
                  ) {
                    return;
                  }
                  try {
                    const record = resetDemoTournamentSession(demo);
                    setDemo(record.demo);
                    setDrawSnapshot(null);
                    setTab('entries');
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Falha ao reiniciar DEMO');
                  }
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reiniciar torneio DEMO
              </GhostBtn>
            )}
            <GhostBtn onClick={() => window.open(entriesObsUrl, '_blank')}>
              <Eye className="w-3.5 h-3.5" /> Overlay
            </GhostBtn>
          </div>
        </div>

        <div
          className="mt-5 flex flex-wrap gap-1.5 p-1 rounded-2xl"
          style={{ background: '#1a1a1f', border: `1px solid ${ui.inputBorder}` }}
          role="tablist"
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            const locked =
              (t.id === 'draw' && !canGoDraw && demo.status === 'entries') ||
              (t.id === 'matchups' &&
                !(
                  demo.status === 'qf' ||
                  demo.status === 'sf' ||
                  demo.status === 'final' ||
                  demo.status === 'completed'
                )) ||
              (t.id === 'champion' && demo.status !== 'completed');
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={locked && t.id !== 'entries' && t.id !== 'overview' && t.id !== 'overlays'}
                onClick={() => trySetTab(t.id)}
                className="px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase flex items-center gap-1.5 transition-colors disabled:opacity-35"
                style={{
                  background: on ? ui.accentGrad : 'transparent',
                  color: on ? '#fff' : ui.muted,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Inscritos" value={String(demo.entries.length)} />
                <Kpi label="Prize pool" value={`${demo.entriesConfig.prizePool}€`} />
                <Kpi
                  label="Inscrições"
                  value={demo.entriesConfig.entriesOpen ? 'Abertas' : 'Encerradas'}
                />
                <Kpi label="Estado" value={STATUS_LABEL[demo.status]} />
              </div>
              <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: ui.muted }}>
                    Continuar
                  </div>
                  <div className="text-lg font-black mt-1" style={{ color: ui.text }}>
                    {STATUS_LABEL[demo.status]}
                  </div>
                </div>
                <PrimaryBtn onClick={() => trySetTab(tabForStatus(demo.status))}>
                  Continuar <ChevronRight className="w-4 h-4" />
                </PrimaryBtn>
              </Card>
            </>
          )}

          {tab === 'entries' && (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase" style={{ color: ui.text }}>
                    Inscrições
                  </h2>
                  <p className="text-[11px] mt-1" style={{ color: ui.muted }}>
                    {demo.entriesConfig.chatCommand} · {demo.entries.length} inscritos ·{' '}
                    {formatEntriesTimer(remaining)}
                  </p>
                </div>
                <span className="text-xs font-bold" style={{ color: entriesClosed ? '#fbbf24' : '#4ade80' }}>
                  {entriesClosed
                    ? remaining <= 0
                      ? 'Tempo esgotado — encerrar para avançar'
                      : 'Encerradas'
                    : demo.entriesConfig.timerPaused
                      ? 'Pausadas'
                      : 'Abertas'}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Nome" value={demo.entriesConfig.tournamentTitle} />
                <Kpi label="Comando" value={demo.entriesConfig.chatCommand} />
                <Kpi label="Prize" value={`${demo.entriesConfig.prizePool}€`} />
                <Kpi label="Tempo" value={formatEntriesTimer(remaining)} />
              </div>

              <div>
                {demo.isDemo ? (
                  <>
                    <div className="text-[10px] font-black uppercase mb-2" style={{ color: ui.muted }}>
                      Roster DEMO ({demo.entries.length} / mínimo 8) — só desenvolvimento
                    </div>
                    <p className="text-[11px] mb-2" style={{ color: ui.muted }}>
                      Sandbox local. Não grava no Supabase / Twitch.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[8, 12, 18, 20, 50].map((n) => (
                        <GhostBtn
                          key={n}
                          active={demo.entries.length === n}
                          onClick={() =>
                            setDemo((p) => (p ? { ...p, entries: buildDemoEntries(n) } : p))
                          }
                        >
                          {n}
                        </GhostBtn>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] font-black uppercase mb-2" style={{ color: ui.muted }}>
                      Inscritos Twitch ({demo.entries.length} · mínimo 8 para sortear)
                    </div>
                    <p className="text-[11px] mb-2" style={{ color: ui.muted }}>
                      Viewers escrevem{' '}
                      <span style={{ color: ui.text }}>{demo.entriesConfig.chatCommand}</span> no
                      chat. Torneio ACTIVE + inscrições abertas. EventSub → bonus_tournament_entries.
                    </p>
                    {operatorUnlocked && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        <GhostBtn
                          onClick={() => {
                            void seedRemoteTestEntries(demo.id).then((res) => {
                              if (!res.ok) {
                                alert(res.error || 'Falha ao adicionar participantes TESTE.');
                                return;
                              }
                              if (res.entries) {
                                setDemo((p) => (p ? { ...p, entries: res.entries! } : p));
                              }
                            });
                          }}
                        >
                          Adicionar 8 participantes TESTE
                        </GhostBtn>
                        <GhostBtn
                          disabled={countBtTestEntries(demo.entries) === 0}
                          onClick={() => {
                            if (
                              !window.confirm(
                                'Remover apenas participantes TESTE (TestPlayer01–08)? Inscritos reais da Twitch não são afetados.',
                              )
                            ) {
                              return;
                            }
                            void removeRemoteTestEntries(demo.id).then((res) => {
                              if (!res.ok) {
                                alert(
                                  res.error ||
                                    'Não foi possível remover. Se o sorteio já correu, repõe primeiro o estado de teste.',
                                );
                                return;
                              }
                              setDemo((p) =>
                                p
                                  ? {
                                      ...p,
                                      entries: p.entries.filter(
                                        (e) => !isBtTestTwitchUserId(e.twitchUserId),
                                      ),
                                    }
                                  : p,
                              );
                            });
                          }}
                        >
                          Remover participantes TESTE
                        </GhostBtn>
                      </div>
                    )}
                    {demo.entries.length === 0 && (
                      <p className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>
                        Ainda sem inscritos. Confirma Twitch online e ACTIVAR este torneio.
                      </p>
                    )}
                    {demo.entries.length > 0 && (
                      <ul
                        className="max-h-40 overflow-y-auto space-y-1 text-[11px]"
                        style={{ color: ui.text }}
                      >
                        {demo.entries.slice(0, 40).map((e) => (
                          <li key={e.id}>
                            {e.displayName}
                            {isBtTestTwitchUserId(e.twitchUserId) ? (
                              <span style={{ color: '#fbbf24' }}> · TESTE</span>
                            ) : null}
                            <span style={{ color: ui.muted }}> · {e.twitchUserId}</span>
                          </li>
                        ))}
                        {demo.entries.length > 40 && (
                          <li style={{ color: ui.muted }}>… +{demo.entries.length - 40}</li>
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <GhostBtn
                  disabled={entriesClosed || demo.entriesConfig.timerPaused}
                  onClick={() =>
                    setDemo((p) => {
                      if (!p) return p;
                      const rem = getEntriesRemainingSeconds(p.entriesConfig);
                      return {
                        ...p,
                        entriesConfig: {
                          ...p.entriesConfig,
                          timerPaused: true,
                          entriesOpen: false,
                          remainingSecondsSnapshot: rem,
                        },
                      };
                    })
                  }
                >
                  Pausar
                </GhostBtn>
                <GhostBtn
                  disabled={!demo.entriesConfig.timerPaused && demo.entriesConfig.entriesOpen}
                  onClick={() =>
                    setDemo((p) => {
                      if (!p) return p;
                      const rem =
                        p.entriesConfig.remainingSecondsSnapshot ??
                        getEntriesRemainingSeconds(p.entriesConfig);
                      return {
                        ...p,
                        entriesConfig: {
                          ...p.entriesConfig,
                          timerPaused: false,
                          entriesOpen: true,
                          timerStartedAt:
                            Date.now() - (p.entriesConfig.durationSeconds - rem) * 1000,
                          remainingSecondsSnapshot: null,
                        },
                      };
                    })
                  }
                >
                  Retomar
                </GhostBtn>
                <GhostBtn
                  onClick={() =>
                    setDemo((p) => {
                      if (!p) return p;
                      const rem = getEntriesRemainingSeconds(p.entriesConfig);
                      if (p.entriesConfig.timerPaused) {
                        return {
                          ...p,
                          entriesConfig: {
                            ...p.entriesConfig,
                            remainingSecondsSnapshot: rem + 5 * 60,
                          },
                        };
                      }
                      return {
                        ...p,
                        entriesConfig: {
                          ...p.entriesConfig,
                          // Push start forward → remaining +5 min
                          timerStartedAt:
                            (p.entriesConfig.timerStartedAt ?? Date.now()) + 5 * 60 * 1000,
                        },
                      };
                    })
                  }
                >
                  +5 minutos
                </GhostBtn>
                <GhostBtn
                  danger
                  disabled={entriesClosed && !demo.entriesConfig.timerPaused}
                  onClick={() => {
                    if (!confirm('Encerrar inscrições definitivamente neste torneio?')) return;
                    setDemo((p) => {
                      if (!p) return p;
                      return {
                        ...p,
                        status: p.status === 'preparation' ? 'entries' : p.status,
                        entriesConfig: {
                          ...p.entriesConfig,
                          entriesOpen: false,
                          timerPaused: true,
                          remainingSecondsSnapshot: getEntriesRemainingSeconds(p.entriesConfig),
                        },
                      };
                    });
                  }}
                >
                  Encerrar inscrições
                </GhostBtn>
                <PrimaryBtn
                  className="!py-2 !text-[11px]"
                  disabled={!canGoDraw}
                  onClick={() => {
                    if (demo.entries.length < 8) {
                      alert('São necessários pelo menos 8 inscritos únicos para o sorteio.');
                      return;
                    }
                    setDemo((p) =>
                      p
                        ? {
                            ...p,
                            status: 'draw',
                            overlayView: 'draw',
                            entriesConfig: {
                              ...p.entriesConfig,
                              entriesOpen: false,
                              timerPaused: true,
                              remainingSecondsSnapshot: getEntriesRemainingSeconds(p.entriesConfig),
                            },
                          }
                        : p,
                    );
                    setTab('draw');
                  }}
                >
                  Ir ao sorteio
                </PrimaryBtn>
              </div>

              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {demo.entries.slice(0, 60).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                    style={{ background: '#1e1e24', border: `1px solid ${ui.inputBorder}` }}
                  >
                    <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-[11px] font-semibold" style={{ color: ui.text }}>
                      {p.displayName}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === 'draw' && (
            <div className="space-y-5">
              <DrawManagerPanel
                tournamentId={demo.id}
                tournamentName={demo.entriesConfig.tournamentTitle || demo.name}
                entries={demo.entries}
                entriesOpen={demo.entriesConfig.entriesOpen}
                requireEntriesClosed
                forceLocal={demo.isDemo}
                onSnapshotChange={onDrawSnapshotChange}
                onDrawPhaseActive={onDrawPhaseActive}
                onLaunchMatchups={handleLaunchMatchups}
                showInlinePreview={false}
                showObsLinks={false}
                onEntriesClosed={() =>
                  setDemo((p) =>
                    p
                      ? {
                          ...p,
                          status: 'draw',
                          overlayView: 'draw',
                          entriesConfig: {
                            ...p.entriesConfig,
                            entriesOpen: false,
                            timerPaused: true,
                            remainingSecondsSnapshot: 0,
                          },
                        }
                      : p,
                  )
                }
              />
            </div>
          )}

          {tab === 'matchups' && (
            <div className="space-y-5">
              {currentRoundMatches.length === 0 && demo.matches.length === 0 ? (
                <Card>
                  <p className="text-sm" style={{ color: ui.muted }}>
                    Ainda sem confrontos. Conclua o sorteio e clique SEGUINTE.
                  </p>
                </Card>
              ) : (
                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <Swords className="w-4 h-4" style={{ color: ui.accentSoft }} />
                    <h3 className="text-sm font-black uppercase" style={{ color: ui.text }}>
                      {demo.status === 'qf' || demo.status === 'sf' || demo.status === 'final'
                        ? ROUND_LABEL[demo.status]
                        : STATUS_LABEL[demo.status]}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(currentRoundMatches.length
                      ? currentRoundMatches
                      : demo.matches.filter(
                          (m) =>
                            m.round === (demo.status === 'completed' ? 'final' : demo.status),
                        )
                    ).map((m) => {
                      const a = players[m.playerAId];
                      const b = players[m.playerBId];
                      const ready = isMatchPlayable(m, players);
                      const on = m.id === demo.selectedMatchId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!ready}
                          onClick={() =>
                            setDemo((prev) =>
                              prev
                                ? { ...prev, selectedMatchId: m.id, overlayView: 'duel' }
                                : prev,
                            )
                          }
                          className="text-left p-3 rounded-xl transition-colors disabled:opacity-40"
                          style={{
                            background: on ? 'rgba(59,130,246,0.15)' : '#1e1e24',
                            border: `1px solid ${on ? 'rgba(96,165,250,0.5)' : ui.inputBorder}`,
                          }}
                        >
                          <div className="text-[10px] font-bold mb-1" style={{ color: ui.muted }}>
                            {m.round.toUpperCase()} · {m.status.toUpperCase()}
                            {m.confirmedWinnerId ? ' · CONFIRMADO' : ''}
                            {!ready ? ' · Aguarda vencedores' : ''}
                          </div>
                          <div className="text-xs font-bold" style={{ color: ui.text }}>
                            {a?.displayName ?? '—'}{' '}
                            <span style={{ color: ui.accentSoft }}>vs</span>{' '}
                            {b?.displayName ?? '—'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}

              {selected &&
                players[selected.playerAId] &&
                players[selected.playerBId] &&
                selected.playerAId !== PENDING_PLAYER_ID && (
                  <Card className="space-y-4">
                    <h3 className="text-sm font-black uppercase" style={{ color: ui.text }}>
                      Gestão do confronto
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <SideEditor
                        key={`${selected.id}-A`}
                        label="Jogador A"
                        player={players[selected.playerAId]!}
                        buyPrice={selected.buyPriceA}
                        buys={selected.buysA}
                        onBuyPriceChange={(raw) => updateBuyPrice('A', raw)}
                        onConfirmPay={(i, raw) => confirmPay('A', i, raw)}
                        highlight={selected.confirmedWinnerId === selected.playerAId}
                      />
                      <SideEditor
                        key={`${selected.id}-B`}
                        label="Jogador B"
                        player={players[selected.playerBId]!}
                        buyPrice={selected.buyPriceB}
                        buys={selected.buysB}
                        onBuyPriceChange={(raw) => updateBuyPrice('B', raw)}
                        onConfirmPay={(i, raw) => confirmPay('B', i, raw)}
                        highlight={selected.confirmedWinnerId === selected.playerBId}
                      />
                    </div>
                    <div
                      className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
                      style={{ background: '#1e1e24', border: `1px solid ${ui.inputBorder}` }}
                    >
                      <div className="text-xs" style={{ color: ui.muted }}>
                        Sugestão:{' '}
                        <strong style={{ color: ui.text }}>
                          {suggested
                            ? players[suggested]?.displayName
                            : 'nenhum (incompleto ou empate)'}
                        </strong>
                      </div>
                      <PrimaryBtn
                        disabled={!suggested || !!selected.confirmedWinnerId}
                        onClick={confirmWinner}
                        className="!py-2 !text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmar vencedor
                      </PrimaryBtn>
                    </div>
                  </Card>
                )}
            </div>
          )}

          {tab === 'champion' && (
            <Card className="space-y-4 text-center py-8">
              <Crown className="w-10 h-10 mx-auto" style={{ color: '#fbbf24' }} />
              <h2 className="text-xl font-black uppercase" style={{ color: ui.text }}>
                Campeão
              </h2>
              {championPlayer ? (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={championPlayer.avatarUrl}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover"
                    style={{ border: '2px solid #fbbf24' }}
                  />
                  <div className="text-2xl font-black" style={{ color: ui.text }}>
                    {championPlayer.displayName}
                  </div>
                  <div className="text-sm" style={{ color: ui.muted }}>
                    {championPlayer.slotName}
                  </div>
                </div>
              ) : (
                <p style={{ color: ui.muted }}>Aguarda o fim da final.</p>
              )}
            </Card>
          )}

          {tab === 'overlays' && (
            <Card className="space-y-4">
              <h2 className="text-sm font-black uppercase" style={{ color: ui.text }}>
                Browser Sources OBS
              </h2>
              <ObsUrlRow
                title="Overlay torneio (inscrições / arena / campeão)"
                url={entriesObsUrl}
                size="288×720"
                copied={copiedUrl === entriesObsUrl}
                onCopy={() => copyUrl(entriesObsUrl)}
              />
              <ObsUrlRow
                title="Overlay sorteio"
                url={drawObsUrl}
                size="288×720"
                copied={copiedUrl === drawObsUrl}
                onCopy={() => copyUrl(drawObsUrl)}
              />
              <ObsUrlRow
                title="Overlay bracket"
                url={bracketObsUrl}
                size="1288×720"
                copied={copiedUrl === bracketObsUrl}
                onCopy={() => copyUrl(bracketObsUrl)}
              />
              <div className="flex flex-wrap gap-2">
                <GhostBtn onClick={() => window.open(bracketPreviewUrl, '_blank')}>
                  <ExternalLink className="w-3.5 h-3.5" /> Preview bracket DEMO
                </GhostBtn>
              </div>
            </Card>
          )}
        </div>

        <div className="xl:sticky xl:top-4 h-fit min-w-0 flex flex-col items-center xl:items-start">
          <div
            className="text-[10px] font-black uppercase tracking-widest mb-2 w-full text-center xl:text-left"
            style={{ color: ui.muted }}
          >
            Preview · 288×720
          </div>
          <div className="overflow-x-auto max-w-full">
            <BonusTournamentOverlay demo={demo} drawSnapshot={drawSnapshot} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  record,
  isActive,
  onContinue,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  record: TournamentSessionRecord;
  isActive: boolean;
  onContinue: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const d = record.demo;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl"
      style={{
        background: '#1e1e24',
        border: `1px solid ${isActive ? 'rgba(74,222,128,0.45)' : ui.inputBorder}`,
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-black truncate" style={{ color: ui.text }}>
            {d.entriesConfig.tournamentTitle || d.name}
          </div>
          {isActive && (
            <span
              className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(74,222,128,0.18)',
                color: '#4ade80',
                border: '1px solid rgba(74,222,128,0.4)',
              }}
            >
              Active
            </span>
          )}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: ui.muted }}>
          {STATUS_LABEL[d.status]} · {d.entries.length} inscritos · {d.entriesConfig.prizePool}€ ·{' '}
          {new Date(record.createdAt).toLocaleString('pt-PT')}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isActive ? (
          <button
            type="button"
            onClick={onDeactivate}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide"
            style={{
              background: 'rgba(74,222,128,0.12)',
              color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.4)',
            }}
            title="Desativar overlays"
          >
            Desativar
          </button>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: ui.muted,
              border: `1px solid ${ui.inputBorder}`,
            }}
            title="Ativar nas overlays OBS"
          >
            Activar
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          title="Apagar torneio"
          aria-label="Apagar torneio"
          className="p-2 rounded-lg transition-colors"
          style={{
            color: ui.muted,
            background: 'transparent',
            border: `1px solid ${ui.inputBorder}`,
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <PrimaryBtn className="!py-2 !text-[11px]" onClick={onContinue}>
          Continuar <ChevronRight className="w-3.5 h-3.5" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

function DeleteTournamentModal({
  record,
  onCancel,
  onConfirm,
}: {
  record: TournamentSessionRecord;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = record.demo.entriesConfig.tournamentTitle || record.demo.name;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bt-delete-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-2xl"
        style={{ background: ui.card, borderColor: ui.cardBorder }}
      >
        <h2 id="bt-delete-title" className="text-lg font-black" style={{ color: ui.text }}>
          Apagar torneio?
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: ui.muted }}>
          Tens a certeza de que queres apagar este torneio? Esta ação elimina os dados locais do
          torneio e não pode ser anulada.
        </p>
        <div
          className="rounded-xl px-3 py-2 text-sm font-bold truncate"
          style={{ background: '#1e1e24', color: ui.accentSoft, border: `1px solid ${ui.inputBorder}` }}
        >
          {name}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <GhostBtn onClick={onCancel}>CANCELAR</GhostBtn>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.45)',
            }}
          >
            APAGAR TORNEIO
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: ui.card, borderColor: ui.cardBorder }}>
      <div className="text-[10px] font-bold uppercase" style={{ color: ui.muted }}>
        {label}
      </div>
      <div className="text-xl font-black mt-1 truncate" style={{ color: ui.text }}>
        {value}
      </div>
    </div>
  );
}

function ObsUrlRow({
  title,
  url,
  size,
  copied,
  onCopy,
}: {
  title: string;
  url: string;
  size: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: '#1e1e24', border: `1px solid ${ui.inputBorder}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold" style={{ color: ui.text }}>
          {title}
        </div>
        <span className="text-[10px] font-bold uppercase" style={{ color: ui.muted }}>
          {size}
        </span>
      </div>
      <code
        className="block text-[11px] break-all rounded-lg px-2 py-1.5"
        style={{ background: '#0f0f12', color: ui.accentSoft }}
      >
        {url}
      </code>
      <GhostBtn onClick={onCopy}>
        <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado' : 'Copiar URL'}
      </GhostBtn>
    </div>
  );
}

function SideEditor({
  label,
  player,
  buyPrice,
  buys,
  onBuyPriceChange,
  onConfirmPay,
  highlight,
}: {
  label: string;
  player: { displayName: string; avatarUrl: string; slotName: string; slotImage: string };
  buyPrice: number | null;
  buys: BonusTournamentMatch['buysA'];
  onBuyPriceChange: (raw: string) => void;
  onConfirmPay: (index: number, raw: string) => boolean;
  highlight?: boolean;
}) {
  const stats = calcSideStats(buyPrice, buys);
  const confirmedKey = `${buys[0]?.pay ?? '∅'}|${buys[1]?.pay ?? '∅'}|${buys[2]?.pay ?? '∅'}`;
  const [drafts, setDrafts] = useState<[string, string, string]>(() => [
    buys[0]?.pay == null ? '' : String(buys[0].pay),
    buys[1]?.pay == null ? '' : String(buys[1].pay),
    buys[2]?.pay == null ? '' : String(buys[2].pay),
  ]);

  useEffect(() => {
    setDrafts([
      buys[0]?.pay == null ? '' : String(buys[0].pay),
      buys[1]?.pay == null ? '' : String(buys[1].pay),
      buys[2]?.pay == null ? '' : String(buys[2].pay),
    ]);
  }, [confirmedKey]);

  const setDraftAt = (index: number, raw: string) => {
    setDrafts((prev) => {
      const next: [string, string, string] = [...prev];
      next[index] = raw;
      return next;
    });
  };

  const confirmAt = (index: number) => {
    const raw = drafts[index] ?? '';
    const ok = onConfirmPay(index, raw);
    if (!ok) return;
    const parsed = parsePayInput(raw);
    if (parsed === undefined) return;
    setDraftAt(index, parsed == null ? '' : String(parsed));
  };

  return (
    <div
      className="rounded-xl p-3 space-y-3"
      style={{
        background: highlight ? 'rgba(59,130,246,0.12)' : '#1e1e24',
        border: `1px solid ${highlight ? 'rgba(96,165,250,0.5)' : ui.inputBorder}`,
      }}
    >
      <div className="flex items-center gap-2">
        <img src={player.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase" style={{ color: ui.muted }}>
            {label}
          </div>
          <div className="text-sm font-bold truncate" style={{ color: ui.text }}>
            {player.displayName}
          </div>
          <div className="text-[10px] truncate" style={{ color: ui.muted }}>
            Slot fixa: {player.slotName}
          </div>
        </div>
        <SlotThumb src={player.slotImage} alt={player.slotName} className="w-10 h-12 rounded object-cover" />
      </div>

      <label className="block text-[9px] font-bold uppercase" style={{ color: ui.muted }}>
        BUY desta ronda (único para as 3 compras · não herda da ronda anterior)
        <input
          type="number"
          step="0.01"
          min="0"
          value={buyPrice ?? ''}
          onChange={(e) => onBuyPriceChange(e.target.value)}
          className="mt-0.5 w-full px-2 py-1.5 rounded-lg text-sm font-bold text-white focus:outline-none"
          style={inputStyle}
        />
      </label>

      <div className="space-y-2">
        {buys.map((buy, i) => {
          const draft = drafts[i] ?? '';
          const draftParsed = parsePayInput(draft);
          const draftMulti = draftParsed === undefined ? null : calcMulti(buyPrice, draftParsed);
          return (
            <div key={i} className="grid grid-cols-[36px_1fr_64px] gap-2 items-center">
              <span className="text-[10px] font-bold" style={{ color: ui.muted }}>
                BUY {i + 1}
              </span>
              <label className="text-[9px] font-bold uppercase" style={{ color: ui.muted }}>
                PAY
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft}
                  onChange={(e) => setDraftAt(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    e.stopPropagation();
                    confirmAt(i);
                  }}
                  className="mt-0.5 w-full px-2 py-1 rounded-lg text-xs text-white focus:outline-none"
                  style={inputStyle}
                />
              </label>
              <div className="text-right">
                <div className="text-[8px] font-bold" style={{ color: ui.muted }}>
                  MULTI
                </div>
                <div className="text-xs font-black" style={{ color: ui.accentSoft }}>
                  {formatMulti(
                    draftParsed === undefined
                      ? calcMulti(buyPrice, buy.pay)
                      : isSameConfirmedPay(buy.pay, draftParsed)
                        ? calcMulti(buyPrice, buy.pay)
                        : draftMulti,
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex justify-between text-[11px] font-bold pt-1"
        style={{ borderTop: `1px solid ${ui.inputBorder}` }}
      >
        <span style={{ color: ui.muted }}>BUY {formatMoney(stats.buyPrice)}</span>
        <span style={{ color: '#86efac' }}>PAY Σ {formatMoney(stats.totalPay)}</span>
        <span style={{ color: ui.accentSoft }}>AVG {formatAvg(stats.avg)}</span>
      </div>
    </div>
  );
}
