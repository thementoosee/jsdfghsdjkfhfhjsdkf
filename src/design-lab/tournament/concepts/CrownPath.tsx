import type { LabMatch, LabParticipant, LabPhase, RoundId } from '../types';
import { ROUND_LABEL } from '../types';
import { LAB_PARTICIPANTS } from '../mock-data';
import { AvatarDisc, PanelShell, truncateName } from '../shared';

/**
 * CONCEPT C — CROWN PATH
 * Ascent metaphor: tournament is a climb toward the crown.
 * Path nodes above, duel in the middle, eliminated trail below.
 */
export function CrownPath({
  phase,
  live,
  championId,
}: {
  phase: LabPhase;
  live: LabMatch | null;
  championId: string | null;
}) {
  const champion = championId ? LAB_PARTICIPANTS.find((p) => p.id === championId) : null;
  const round: RoundId =
    live?.round ?? (phase === 'champion' ? 'champion' : phase === 'intro' ? 'r16' : (phase as RoundId));

  return (
    <PanelShell accent="#a78bfa">
      <style>{`
        @keyframes crownFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pathGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.0); }
          50% { box-shadow: 0 0 16px 2px rgba(167,139,250,0.45); }
        }
        @keyframes climbIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .crown-anim { animation: none !important; }
        }
      `}</style>

      {/* Crown / summit */}
      <div style={{ padding: '16px 14px 8px', textAlign: 'center' }}>
        <div
          className="crown-anim"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(167,139,250,0.35)',
            background: 'rgba(167,139,250,0.1)',
            animation: phase === 'champion' ? 'crownFloat 2.2s ease-in-out infinite' : 'none',
          }}
        >
          <span style={{ fontSize: 12 }}>♛</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#ddd6fe' }}>
            {phase === 'champion' ? 'CROWNED' : 'CROWN PATH'}
          </span>
        </div>
      </div>

      {/* Ascent nodes */}
      <div style={{ padding: '4px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {(['r16', 'qf', 'sf', 'final'] as RoundId[]).map((r, i) => {
          const active = r === round || (phase === 'champion' && r === 'final');
          const lit = phaseIndex(phase) >= phaseIndex(r);
          return (
            <div key={r} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
                <div
                  className="crown-anim"
                  style={{
                    width: active ? 14 : 10,
                    height: active ? 14 : 10,
                    borderRadius: '50%',
                    background: active ? '#c4b5fd' : lit ? '#7c3aed' : 'rgba(255,255,255,0.12)',
                    animation: active ? 'pathGlow 1.8s ease-in-out infinite' : 'none',
                  }}
                />
                <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.08em', color: active ? '#e9d5ff' : '#64748b' }}>
                  {ROUND_LABEL[r].slice(0, 3)}
                </span>
              </div>
              {i < 3 && (
                <div
                  style={{
                    height: 2,
                    flex: 1,
                    marginBottom: 14,
                    background: lit ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {phase === 'intro' && <PathIntro />}
      {phase === 'champion' && champion && <SummitChampion p={champion} />}
      {phase !== 'intro' && phase !== 'champion' && live && <ClimbDuel match={live} />}

      {/* Eliminated trail */}
      {phase !== 'intro' && phase !== 'champion' && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 14px' }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: '#64748b', marginBottom: 6 }}>
            TRAIL · ELIMINADOS
          </div>
          <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
            {LAB_PARTICIPANTS.slice(1, 7).map((p) => (
              <div key={p.id} style={{ opacity: 0.55 }}>
                <AvatarDisc p={p} size={28} dimmed />
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function phaseIndex(phase: LabPhase | RoundId): number {
  const order = ['intro', 'r16', 'qf', 'sf', 'final', 'champion'];
  return Math.max(0, order.indexOf(phase));
}

function PathIntro() {
  return (
    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 4 }}>16 em busca da coroa</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {LAB_PARTICIPANTS.map((p, i) => (
          <div
            key={p.id}
            className="crown-anim"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              animation: `climbIn 0.4s ease ${i * 0.03}s both`,
            }}
          >
            <AvatarDisc p={p} size={36} />
            <span style={{ fontSize: 8, fontWeight: 700, color: '#cbd5e1' }}>{truncateName(p.name, 7)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClimbDuel({ match }: { match: LabMatch }) {
  return (
    <div className="crown-anim" style={{ padding: '8px 14px 90px', animation: 'climbIn 0.5s ease both' }}>
      <div
        style={{
          textAlign: 'center',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.22em',
          color: '#c4b5fd',
          marginBottom: 12,
        }}
      >
        {ROUND_LABEL[match.round]} · DUELO
      </div>
      <ClimbFighter p={match.a} score={match.scoreA} highlight={match.status === 'live'} />
      <div
        style={{
          textAlign: 'center',
          margin: '10px 0',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.3em',
          color: 'rgba(167,139,250,0.85)',
        }}
      >
        — VS —
      </div>
      <ClimbFighter p={match.b} score={match.scoreB} highlight={match.status === 'live'} />
      {match.status === 'live' && (
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: '#f87171' }}>
          EM JOGO
        </div>
      )}
    </div>
  );
}

function ClimbFighter({
  p,
  score,
  highlight,
}: {
  p: LabParticipant;
  score?: number;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 10px',
        borderRadius: 12,
        background: highlight ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${highlight ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <AvatarDisc p={p} size={44} ring={highlight ? '#a78bfa' : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#ddd6fe', fontVariantNumeric: 'tabular-nums' }}>{score ?? '–'}</div>
    </div>
  );
}

function SummitChampion({ p }: { p: LabParticipant }) {
  return (
    <div className="crown-anim" style={{ padding: '28px 16px', textAlign: 'center', animation: 'climbIn 0.55s ease both' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.28em', color: '#c4b5fd', fontWeight: 800, marginBottom: 14 }}>CAMPEÃO</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <AvatarDisc p={p} size={100} ring="#c4b5fd" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{p.name}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>Chegou ao topo do Crown Path</div>
    </div>
  );
}
