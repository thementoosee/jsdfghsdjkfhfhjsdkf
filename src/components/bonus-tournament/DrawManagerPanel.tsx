import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Copy,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Square,
  Swords,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  applyDrawCommand,
  canConfirmSlot,
  canCorrectSlot,
  canGenerateDraw,
  canLaunchMatchups,
  canNext,
  canPause,
  canRestartPresentation,
  canResume,
  maybeAutoAdvance,
  mergeRemoteIfNewer,
} from './draw-presentation-machine';
import { uniqueEntriesByTwitchId } from './draw-result';
import { DRAW_TIMING } from './draw-timing';
import { invokeDrawCommand } from './draw-cmd-client';
import { areEntriesClosedForDraw } from './entries-closed';
import { pingOperatorAdmin } from './tournament-remote-api';
import {
  asObsSnapshot,
  fetchDrawState,
  probeDrawSync,
  subscribeDrawState,
  type DrawSyncStatus,
} from './draw-sync';
import {
  createIdleDrawState,
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  countConfirmedSlots,
  currentRevealPlayer,
  type DrawAdminCommand,
  type DrawPresentationState,
  type DrawPublicSnapshot,
} from './draw-types';
import { DrawSidebarOverlay } from './DrawSidebarOverlay';
import { DrawSlotPicker } from './DrawSlotPicker';
import { SlotThumb } from './SlotThumb';
import { buildDemoSlotCatalogPicks } from './demo-data';
import type { BonusTournamentEntry } from './types';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';

const SIDEBAR_W = MAIN_OVERLAY_SIDEBAR_WIDTH_PX;
const SIDEBAR_H = 720;

export function DrawManagerPanel({
  tournamentId,
  tournamentName,
  entries,
  entriesOpen,
  onEntriesClosed,
  onSnapshotChange,
  onDrawPhaseActive,
  onLaunchMatchups,
  requireEntriesClosed = false,
  showInlinePreview = true,
  showObsLinks = true,
  forceLocal = false,
}: {
  /** Live tournament UUID — used for draw presentations + Edge GENERATE. */
  tournamentId: string;
  tournamentName: string;
  entries: BonusTournamentEntry[];
  entriesOpen: boolean;
  onEntriesClosed: () => void;
  /** Live preview for the Manager sidebar overlay. */
  onSnapshotChange?: (snapshot: DrawPublicSnapshot | null) => void;
  /** When ceremony is active — Manager should set overlayView to draw. */
  onDrawPhaseActive?: (active: boolean) => void;
  /** After SEGUINTE / LAUNCH — Manager builds QF confrontos from locked result. */
  onLaunchMatchups?: (snapshot: DrawPublicSnapshot) => void;
  /** When true, START is blocked until Dashboard closed entries. */
  requireEntriesClosed?: boolean;
  /** When false, Manager hosts a single sticky preview elsewhere. */
  showInlinePreview?: boolean;
  /** When false, OBS URLs live in the Overlays tab. */
  showObsLinks?: boolean;
  /** DEMO / offline sandbox — never hit Edge GENERATE. */
  forceLocal?: boolean;
}) {
  const unique = uniqueEntriesByTwitchId(entries);
  const [state, setState] = useState<DrawPresentationState>(() =>
    createIdleDrawState({
      tournamentId,
      tournamentName,
      uniqueEntryCount: unique.length,
      entriesClosed: !entriesOpen,
    }),
  );

  useEffect(() => {
    setState(
      createIdleDrawState({
        tournamentId,
        tournamentName,
        uniqueEntryCount: unique.length,
        entriesClosed: !entriesOpen,
      }),
    );
    // Reset draw machine when switching tournament identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional identity gate
  }, [tournamentId]);
  const [syncStatus, setSyncStatus] = useState<DrawSyncStatus>('unknown');
  const [syncDetail, setSyncDetail] = useState<string | undefined>();
  const [adminOk, setAdminOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [correctTargetId, setCorrectTargetId] = useState<string | null>(null);
  const commandLockUntil = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const localOnly =
    forceLocal || syncStatus === 'missing_table' || syncStatus === 'unknown';
  const snapshot = useMemo(() => asObsSnapshot(state), [state]);
  const confirmed = countConfirmedSlots(state.result);
  const awaitingPlayer = currentRevealPlayer(state);
  const demoFallbacks = useMemo(() => buildDemoSlotCatalogPicks(8), []);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);

  useEffect(() => {
    const active =
      state.phase !== 'idle' &&
      state.runStatus !== 'idle' &&
      !!state.result;
    onDrawPhaseActive?.(active);
  }, [state.phase, state.runStatus, state.result, onDrawPhaseActive]);

  useEffect(() => {
    setState((s) => ({
      ...s,
      tournamentName,
      uniqueEntryCount: unique.length,
      entriesClosed: s.entriesClosed || !entriesOpen,
    }));
  }, [tournamentName, unique.length, entriesOpen]);

  const refreshAdmin = useCallback(async () => {
    const ping = await pingOperatorAdmin();
    setAdminOk(ping.ok);
    return ping;
  }, []);

  const dispatchCommand = useCallback(
    async (command: DrawAdminCommand) => {
      const now = Date.now();
      if (now < commandLockUntil.current || busy) return;
      commandLockUntil.current = now + DRAW_TIMING.commandLockMs;
      setBusy(true);
      setLastError(null);
      try {
        const prev = stateRef.current;

        if (localOnly) {
          const next = await applyDrawCommand(prev, command);
          if (next !== prev) setState(next);
          return;
        }

        const admin = await refreshAdmin();
        if (!admin.ok) {
          setLastError(
            'Admin remoto indisponível. Verifica o proxy /api/bt-draw-cmd e as Edge secrets.',
          );
          return;
        }

        const res = await invokeDrawCommand({
          tournamentId: tournamentId,
          expectedVersion: prev.version,
          command,
        });
        if (!res.ok) {
          if (res.remote) setState(res.remote);
          if (res.error === 'entries_source_unavailable') {
            setLastError(
              res.detail ??
                'GENERATE remoto bloqueado: falta fonte confiável em bonus_tournament_entries.',
            );
          } else {
            setLastError(res.detail ? `${res.error}: ${res.detail}` : res.error);
          }
          return;
        }
        setState(res.state);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, localOnly, refreshAdmin],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshAdmin();
      const probe = await probeDrawSync();
      if (cancelled) return;
      setSyncStatus(probe.status);
      setSyncDetail(probe.detail);
      if (probe.status !== 'ready') return;
      const remote = await fetchDrawState(tournamentId);
      if (cancelled) return;
      setSyncStatus(remote.status);
      setSyncDetail(remote.detail);
      if (remote.state) setState((local) => mergeRemoteIfNewer(local, remote.state!));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAdmin]);

  useEffect(() => {
    if (syncStatus !== 'ready') return;
    const sub = subscribeDrawState(tournamentId, (snap) => {
      setState((local) =>
        mergeRemoteIfNewer(local, {
          ...local,
          ...snap,
          result: snap.result,
        }),
      );
    });
    const poll = setInterval(() => {
      void fetchDrawState(tournamentId).then((remote) => {
        if (remote.state) setState((local) => mergeRemoteIfNewer(local, remote.state!));
      });
    }, 4000);
    return () => {
      sub.unsubscribe();
      clearInterval(poll);
    };
  }, [syncStatus]);

  useEffect(() => {
    if (!localOnly) return;
    if (state.runStatus !== 'running') return;
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      const advanced = maybeAutoAdvance(cur);
      if (!advanced) return;
      setState(advanced);
    }, 200);
    return () => clearInterval(id);
  }, [state.runStatus, localOnly]);

  const obsUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/bonus-tournament/draw`
      : '/bonus-tournament/draw';

  const entriesClosedForDraw = areEntriesClosedForDraw({
    tournamentEntriesOpen: entriesOpen,
    presentationEntriesClosed: state.entriesClosed,
  });

  const closeEntries = () => {
    if (!confirm('Encerrar inscrições? Não poderá aceitar novos inscritos neste DEMO até reset.')) {
      return;
    }
    onEntriesClosed();
    void dispatchCommand({ type: 'CLOSE_ENTRIES' });
  };

  const generate = () => {
    if (!canGenerateDraw(unique.length, entriesClosedForDraw)) {
      alert(`Precisa de ${DRAW_SLOT_COUNT} inscritos únicos e inscrições encerradas.`);
      return;
    }
    void dispatchCommand({ type: 'GENERATE_DRAW', entries: unique });
  };

  /**
   * START: close entries → generate if needed (keep locked draw) → countdown 3.
   * Tournament `entries_open` is SoT; presentation `entries_closed` is synced when stale.
   */
  const startCeremony = async () => {
    if (busy) return;
    if (unique.length < DRAW_SLOT_COUNT) {
      setLastError(`Precisa de ${DRAW_SLOT_COUNT} inscritos únicos para iniciar.`);
      return;
    }
    if (requireEntriesClosed && entriesOpen) {
      setLastError('Encerrar inscrições na Dashboard antes de iniciar o sorteio.');
      return;
    }
    const live =
      (state.runStatus === 'running' || state.runStatus === 'paused') &&
      state.phase !== 'idle' &&
      state.phase !== 'awaiting_advance';
    if (live) {
      setLastError('Apresentação já em curso.');
      return;
    }

    setBusy(true);
    setLastError(null);
    commandLockUntil.current = Date.now() + DRAW_TIMING.commandLockMs;
    try {
      let prev = stateRef.current;

      // Sync presentation mirror when tournament already closed, or close both when allowed.
      if (!prev.entriesClosed || entriesOpen) {
        if (entriesOpen && requireEntriesClosed) {
          setLastError('Encerrar inscrições na Dashboard antes de iniciar o sorteio.');
          return;
        }
        if (entriesOpen) onEntriesClosed();
        if (localOnly) {
          prev = await applyDrawCommand(prev, { type: 'CLOSE_ENTRIES' });
        } else {
          const admin = await refreshAdmin();
          if (!admin.ok) {
            setLastError('Admin remoto indisponível. Verifica o proxy /api/bt-draw-cmd.');
            return;
          }
          const res = await invokeDrawCommand({
            tournamentId: tournamentId,
            expectedVersion: prev.version,
            command: { type: 'CLOSE_ENTRIES' },
          });
          if (!res.ok) {
            if (res.remote) setState(res.remote);
            setLastError(res.detail ? `${res.error}: ${res.detail}` : res.error);
            return;
          }
          prev = res.state;
        }
        setState(prev);
        stateRef.current = prev;
      }

      if (!prev.result) {
        if (localOnly) {
          prev = await applyDrawCommand(prev, { type: 'GENERATE_DRAW', entries: unique });
        } else {
          const admin = await refreshAdmin();
          if (!admin.ok) {
            setLastError('Desbloqueie os comandos do sorteio antes de iniciar.');
            return;
          }
          const res = await invokeDrawCommand({
            tournamentId: tournamentId,
            expectedVersion: prev.version,
            command: { type: 'GENERATE_DRAW', entries: unique },
          });
          if (!res.ok) {
            if (res.remote) setState(res.remote);
            setLastError(res.detail ? `${res.error}: ${res.detail}` : res.error);
            return;
          }
          prev = res.state;
        }
        setState(prev);
        stateRef.current = prev;
      }

      if (localOnly) {
        prev = await applyDrawCommand(prev, { type: 'START_PRESENTATION' });
      } else {
        const admin = await refreshAdmin();
        if (!admin.ok) {
          setLastError('Desbloqueie os comandos do sorteio antes de iniciar.');
          return;
        }
        const res = await invokeDrawCommand({
          tournamentId: tournamentId,
          expectedVersion: prev.version,
          command: { type: 'START_PRESENTATION' },
        });
        if (!res.ok) {
          if (res.remote) setState(res.remote);
          setLastError(res.detail ? `${res.error}: ${res.detail}` : res.error);
          return;
        }
        prev = res.state;
      }
      setState(prev);
      stateRef.current = prev;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => {
    if (
      !confirm(
        'NOVO SORTEIO REAL: isto substitui participantes e confrontos. A apresentação anterior fica inválida. Continuar?',
      )
    ) {
      return;
    }
    void dispatchCommand({ type: 'REGENERATE_DRAW', entries: unique });
  };

  const SyncIcon = syncStatus === 'ready' ? Wifi : WifiOff;
  const showSlotPicker =
    state.phase === 'awaiting_slot' && awaitingPlayer && canConfirmSlot(state);
  const showLaunch = canLaunchMatchups(state);

  return (
    <section
      className="rounded-2xl p-4 space-y-4"
      style={{ background: '#26262b', border: '1px solid rgba(82,82,91,0.7)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase" style={{ color: '#f8fafc' }}>
            Controlo do sorteio
          </h3>
          <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>
            Revelação → escolha de slot → lançar confrontos · {SIDEBAR_W}×{SIDEBAR_H}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded"
          style={{
            background: syncStatus === 'ready' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            color: syncStatus === 'ready' ? '#4ade80' : '#f87171',
            border: `1px solid ${syncStatus === 'ready' ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'}`,
          }}
          title={syncDetail}
        >
          <SyncIcon className="w-3.5 h-3.5" />
          OBS {syncStatus === 'ready' ? 'lido OK' : syncStatus === 'missing_table' ? 'migration pendente' : syncStatus}
          {' · '}
          Admin {adminOk ? 'OK' : 'indisponível'}
        </div>
      </div>

      {syncStatus === 'missing_table' && (
        <div
          className="text-[11px] rounded-xl p-3"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(96,165,250,0.35)', color: '#93c5fd' }}
        >
          Modo local DEMO: avanço no browser. Escolha de slot e confrontos usam a máquina local.
          Remoto: requer migrations BT + deploy draw-cmd/tick + proxy /api/bt-draw-cmd.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Torneio" value={tournamentName} />
        <Stat label="Inscritos únicos" value={String(unique.length)} />
        <Stat label="Jogador" value={`${state.revealedPlayers}/${DRAW_SLOT_COUNT}`} />
        <Stat label="Slots escolhidas" value={`${confirmed}/${DRAW_SLOT_COUNT}`} />
        <Stat label="Confrontos" value={`${state.revealedMatches}/${DRAW_MATCH_COUNT}`} />
        <Stat label="Fase" value={state.phase} />
        <Stat label="Estado" value={state.runStatus} />
        <Stat label="Resultado" value={state.result ? 'fixo' : '—'} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Btn
          label="START"
          onClick={() => void startCeremony()}
          disabled={
            busy ||
            unique.length < DRAW_SLOT_COUNT ||
            ((state.runStatus === 'running' || state.runStatus === 'paused') &&
              state.phase !== 'idle' &&
              state.phase !== 'awaiting_advance')
          }
          icon={<Play className="w-3.5 h-3.5" />}
          primary
        />
        <Btn label="Encerrar inscrições" onClick={closeEntries} disabled={!entriesOpen && state.entriesClosed} icon={<Square className="w-3.5 h-3.5" />} />
        <Btn
          label="Gerar sorteio"
          onClick={generate}
          disabled={!canGenerateDraw(unique.length, entriesClosedForDraw) || !!state.result || busy}
          icon={<Shuffle className="w-3.5 h-3.5" />}
        />
        <Btn label="Novo sorteio (admin)" onClick={regenerate} disabled={unique.length < DRAW_SLOT_COUNT || busy} icon={<Shuffle className="w-3.5 h-3.5" />} />
        <Btn label="Pausar" onClick={() => void dispatchCommand({ type: 'PAUSE' })} disabled={!canPause(state) || busy} icon={<Pause className="w-3.5 h-3.5" />} />
        <Btn label="Retomar" onClick={() => void dispatchCommand({ type: 'RESUME' })} disabled={!canResume(state) || busy} icon={<Play className="w-3.5 h-3.5" />} />
        <Btn
          label="Próximo"
          onClick={() => void dispatchCommand({ type: 'NEXT' })}
          disabled={!canNext(state) || busy}
          icon={<SkipForward className="w-3.5 h-3.5" />}
        />
        <Btn
          label="Reiniciar apresentação"
          onClick={() => {
            if (
              !confirm(
                'Repetir a apresentação desde o início? Os 8 jogadores e as slots já atribuídas mantêm-se.',
              )
            ) {
              return;
            }
            void dispatchCommand({ type: 'RESTART_PRESENTATION' });
          }}
          disabled={!canRestartPresentation(state) || busy}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        />
      </div>
      <p className="text-[10px]" style={{ color: '#94a3b8' }}>
        START usa o sorteio bloqueado (ou gera uma vez) e abre a contagem 3 → 2 → 1. Não inicia ao entrar
        na página.
      </p>

      {state.phase === 'awaiting_slot' && (
        <div
          className="text-[11px] rounded-xl px-3 py-2 font-bold"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd' }}
        >
          AWAITING_SLOT — Próximo bloqueado até CONFIRMAR SLOT
        </div>
      )}

      {showSlotPicker && awaitingPlayer && (
        <DrawSlotPicker
          player={awaitingPlayer}
          positionLabel={`Jogador ${String(state.revealedPlayers).padStart(2, '0')} / ${DRAW_SLOT_COUNT}`}
          disabled={busy}
          confirming={busy}
          demoFallbacks={localOnly ? demoFallbacks : undefined}
          onConfirm={(pick) => {
            void dispatchCommand({
              type: 'CONFIRM_SLOT',
              twitchUserId: awaitingPlayer.twitchUserId,
              slotId: pick.slotId,
              slotName: pick.slotName,
              slotImage: pick.slotImage,
            });
          }}
        />
      )}

      {showLaunch && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)' }}
        >
          <div className="text-sm font-black uppercase" style={{ color: '#4ade80' }}>
            8 jogadores · 8 slots — apresentação pronta
          </div>
          <p className="text-[11px]" style={{ color: '#94a3b8' }}>
            SEGUINTE inicia a apresentação visual dos 4 duelos na overlay. Os confrontos QF só
            começam depois, com COMEÇAR CONFRONTOS.
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn
              label="Reiniciar apresentação"
              onClick={() => {
                if (
                  !confirm(
                    'Repetir a apresentação desde o início? Os 8 jogadores e as slots já atribuídas mantêm-se.',
                  )
                ) {
                  return;
                }
                void dispatchCommand({ type: 'RESTART_PRESENTATION' });
              }}
              disabled={!canRestartPresentation(state) || busy}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            />
            <Btn
              label="SEGUINTE — Apresentar duelos"
              onClick={() => {
                void (async () => {
                  // Start reveal_match only — do NOT launch QF yet.
                  await dispatchCommand({ type: 'LAUNCH_MATCHUPS' });
                })();
              }}
              disabled={busy || !canLaunchMatchups(state)}
              icon={<Swords className="w-3.5 h-3.5" />}
              primary
            />
          </div>
        </div>
      )}

      {state.phase === 'reveal_match' && (
        <div
          className="text-[11px] rounded-xl px-3 py-2 font-bold"
          style={{
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24',
          }}
        >
          A apresentar duelos · Jogo {state.revealedMatches}/{DRAW_MATCH_COUNT}
        </div>
      )}

      {state.phase === 'awaiting_advance' && state.result && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)' }}
        >
          <div className="text-sm font-black uppercase" style={{ color: '#fbbf24' }}>
            Duelos apresentados — pronto para os quartos
          </div>
          <Btn
            label="COMEÇAR CONFRONTOS"
            onClick={() => {
              const snap = asObsSnapshot(stateRef.current);
              onLaunchMatchups?.(snap);
            }}
            disabled={busy}
            icon={<Swords className="w-3.5 h-3.5" />}
            primary
          />
        </div>
      )}

      {canCorrectSlot(state) && state.result && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase" style={{ color: '#8a8a8a' }}>
            Corrigir slot (antes de lançar confrontos)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
            {state.result.selected
              .filter((p) => p.slot?.slotId)
              .map((p, i) => (
                <button
                  key={p.twitchUserId}
                  type="button"
                  onClick={() => setCorrectTargetId(p.twitchUserId)}
                  className="flex items-center gap-2 p-2 rounded-lg text-left"
                  style={{
                    background: correctTargetId === p.twitchUserId ? 'rgba(59,130,246,0.15)' : '#1e1e24',
                    border: `1px solid ${correctTargetId === p.twitchUserId ? 'rgba(96,165,250,0.5)' : '#3a3a44'}`,
                  }}
                >
                  <span className="text-[10px] font-bold" style={{ color: '#8a8a8a' }}>
                    #{i + 1}
                  </span>
                  <img src={p.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold truncate" style={{ color: '#d4d4d4' }}>
                      {p.displayName}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: '#8a8a8a' }}>
                      {p.slot?.slotName}
                    </div>
                  </div>
                  {p.slot && (
                    <SlotThumb src={p.slot.slotImage} alt={p.slot.slotName} className="w-7 h-9 rounded object-cover" />
                  )}
                </button>
              ))}
          </div>
          {correctTargetId && (
            <DrawSlotPicker
              player={state.result.selected.find((p) => p.twitchUserId === correctTargetId)!}
              positionLabel="Corrigir slot"
              disabled={busy || state.phase === 'awaiting_slot'}
              confirming={busy}
              demoFallbacks={localOnly ? demoFallbacks : undefined}
              onConfirm={(pick) => {
                void dispatchCommand({
                  type: 'CORRECT_SLOT',
                  twitchUserId: correctTargetId,
                  slotId: pick.slotId,
                  slotName: pick.slotName,
                  slotImage: pick.slotImage,
                }).then(() => setCorrectTargetId(null));
              }}
            />
          )}
        </div>
      )}

      {showObsLinks && (
        <div className="flex flex-wrap gap-2 items-center">
          <a
            href={obsUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5"
            style={{ background: '#1e1e24', border: '1px solid #3a3a44', color: '#60a5fa' }}
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir overlay OBS
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(obsUrl);
            }}
            className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5"
            style={{ background: '#1e1e24', border: '1px solid #3a3a44', color: '#e2e8f0' }}
          >
            <Copy className="w-3.5 h-3.5" /> Copiar URL OBS
          </button>
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>
            OBS → Browser Source → {SIDEBAR_W}×{SIDEBAR_H} (lateral)
          </span>
          <a
            href="/bonus-tournament/draw-preview"
            className="text-[10px] font-bold uppercase"
            style={{ color: '#60a5fa' }}
          >
            Preview visual DEMO
          </a>
        </div>
      )}

      {lastError && (
        <div className="text-[11px]" style={{ color: '#f87171' }}>
          {lastError}
        </div>
      )}

      {showInlinePreview && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>
            Preview lateral {SIDEBAR_W}×{SIDEBAR_H} {localOnly ? '(local)' : '(espelho)'}
          </div>
          <div
            className="overflow-hidden rounded-xl inline-block"
            style={{ border: '1px solid #3a3a44', width: SIDEBAR_W, height: SIDEBAR_H }}
          >
            <DrawSidebarOverlay snapshot={snapshot} />
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: '#1e1e24', border: '1px solid #3a3a44' }}>
      <div className="text-[9px] font-bold uppercase" style={{ color: '#94a3b8' }}>
        {label}
      </div>
      <div className="text-xs font-black truncate" style={{ color: '#f8fafc' }}>
        {value}
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  icon,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-35"
      style={{
        background: primary ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' : '#1e1e24',
        color: primary ? '#fff' : '#e2e8f0',
        border: `1px solid ${primary ? 'rgba(96,165,250,0.5)' : '#3a3a44'}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
