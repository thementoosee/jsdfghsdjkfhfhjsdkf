import type { LabMatch, LabPhase, RoundId } from '../types';
import { ROUND_LABEL } from '../types';
import { LAB_PARTICIPANTS } from '../mock-data';
import { roundMatches } from '../mock-data';
import { AvatarDisc, PanelShell, truncateName } from '../shared';

/**
 * CONCEPT B — SIGNAL RAIL
 * Editorial broadcast / sports-network masthead + vertical signal thermometer.
 * Progress lives on a left rail; duel is a clean split board.
 */
export function SignalRail({
  phase,
  live,
  matches,
  championId,
}: {
  phase: LabPhase;
  live: LabMatch | null;
  matches: LabMatch[];
  championId: string | null;
}) {
  const champion = championId ? LAB_PARTICIPANTS.find((p) => p.id === championId) : null;
  const round: RoundId =
    live?.round ?? (phase === 'champion' ? 'champion' : phase === 'intro' ? 'r16' : (phase as RoundId));
  const doneInRound = roundMatches(matches, round === 'champion' ? 'final' : round).filter((m) => m.status === 'done');

  return (
    <PanelShell accent="#22d3ee">
      <style>{`
        @keyframes signalSweep {
          0% { transform: translateX(-120%); opacity: 0; }
          30% { opacity: 0.7; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        @keyframes signalRise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes signalBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          .signal-anim { animation: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', height: '100%' }}>
        {/* Left thermometer rail */}
        <div
          style={{
            width: 28,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.35)',
            borderRight: '1px solid rgba(34,211,238,0.18)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px 0',
            gap: 0,
          }}
        >
          {(['r16', 'qf', 'sf', 'final', 'champion'] as RoundId[]).map((r, i, arr) => {
            const active = r === round || (phase === 'intro' && r === 'r16');
            const past = phaseIndex(phase) > phaseIndex(r === 'champion' ? 'champion' : r);
            return (
              <div key={r} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div
                  style={{
                    width: active ? 10 : 7,
                    height: active ? 10 : 7,
                    borderRadius: '50%',
                    background: active ? '#22d3ee' : past ? '#67e8f9' : 'rgba(255,255,255,0.15)',
                    boxShadow: active ? '0 0 10px #22d3ee' : 'none',
                  }}
                />
                <div
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    fontSize: 7,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    color: active ? '#a5f3fc' : 'rgba(148,163,184,0.7)',
                    marginTop: 6,
                    marginBottom: 6,
                  }}
                >
                  {ROUND_LABEL[r].slice(0, 6)}
                </div>
                {i < arr.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 8,
                      background: past || active ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.08)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Main editorial column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Masthead */}
          <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
            <div
              className="signal-anim"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.12), transparent)',
                animation: 'signalSweep 3.5s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.24em', color: '#67e8f9' }}>LIVE SIGNAL</div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.04em', color: '#fff', marginTop: 2 }}>
              {ROUND_LABEL[round]}
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
              {live ? `MATCH ${live.index + 1}` : phase === 'champion' ? 'ENCERRADO' : 'CAMPO'}
            </div>
          </div>

          {phase === 'intro' && (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
              {LAB_PARTICIPANTS.map((p, i) => (
                <div
                  key={p.id}
                  className="signal-anim"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 6px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    animation: `signalRise 0.4s ease ${i * 0.03}s both`,
                  }}
                >
                  <span style={{ fontSize: 9, color: '#64748b', width: 14 }}>{p.seed}</span>
                  <AvatarDisc p={p} size={22} />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{truncateName(p.name, 14)}</span>
                </div>
              ))}
            </div>
          )}

          {phase === 'champion' && champion && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.28em', color: '#67e8f9', fontWeight: 800 }}>WINNER</div>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                <AvatarDisc p={champion} size={84} ring="#22d3ee" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{champion.name}</div>
            </div>
          )}

          {phase !== 'intro' && phase !== 'champion' && live && (
            <div className="signal-anim" style={{ padding: 12, animation: 'signalRise 0.45s ease both' }}>
              <SplitBoard match={live} />
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', color: '#64748b', marginBottom: 6 }}>
                  RESULTADOS · {ROUND_LABEL[round]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {doneInRound.slice(-4).map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        padding: '5px 6px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        color: '#94a3b8',
                      }}
                    >
                      <span>
                        <span style={{ color: m.winnerId === m.a.id ? '#e2e8f0' : '#64748b', fontWeight: 700 }}>
                          {truncateName(m.a.name, 8)}
                        </span>
                        {' · '}
                        <span style={{ color: m.winnerId === m.b.id ? '#e2e8f0' : '#64748b', fontWeight: 700 }}>
                          {truncateName(m.b.name, 8)}
                        </span>
                      </span>
                      <span style={{ color: '#67e8f9', fontWeight: 800 }}>
                        {m.scoreA ?? 0}-{m.scoreB ?? 0}
                      </span>
                    </div>
                  ))}
                  {doneInRound.length === 0 && (
                    <div style={{ fontSize: 10, color: '#64748b' }}>Sem resultados ainda nesta ronda.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function phaseIndex(phase: LabPhase | RoundId): number {
  const order = ['intro', 'r16', 'qf', 'sf', 'final', 'champion'];
  return order.indexOf(phase);
}

function SplitBoard({ match }: { match: LabMatch }) {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(34,211,238,0.25)',
        background: 'rgba(8,15,28,0.8)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(34,211,238,0.08)',
          borderBottom: '1px solid rgba(34,211,238,0.15)',
        }}
      >
        <span
          className="signal-anim"
          style={{
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: '0.2em',
            color: match.status === 'live' ? '#f87171' : '#67e8f9',
            animation: match.status === 'live' ? 'signalBlink 1.2s ease-in-out infinite' : 'none',
          }}
        >
          {match.status === 'live' ? 'AO VIVO' : 'BOARD'}
        </span>
        <span style={{ fontSize: 9, color: '#94a3b8' }}>#{match.index + 1}</span>
      </div>
      <PlayerRow p={match.a} score={match.scoreA} won={match.winnerId === match.a.id} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <PlayerRow p={match.b} score={match.scoreB} won={match.winnerId === match.b.id} />
    </div>
  );
}

function PlayerRow({
  p,
  score,
  won,
}: {
  p: { id: string; name: string; seed: number; avatarHue: number };
  score?: number;
  won?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px' }}>
      <AvatarDisc p={p} size={40} ring={won ? '#22d3ee' : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </div>
        <div style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.12em', fontWeight: 700 }}>SEED {p.seed}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: won ? '#67e8f9' : '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
        {score ?? '–'}
      </div>
    </div>
  );
}
