import type { LabMatch, LabParticipant, LabPhase } from '../types';
import { ROUND_LABEL } from '../types';
import { LAB_PARTICIPANTS } from '../mock-data';
import { AvatarDisc, PanelShell, truncateName } from '../shared';

/**
 * CONCEPT A — ARENA DUEL
 * Vertical fight-card / arena poster. One duel owns the column.
 */
export function ArenaDuel({
  phase,
  live,
  championId,
}: {
  phase: LabPhase;
  live: LabMatch | null;
  championId: string | null;
}) {
  const champion = championId ? LAB_PARTICIPANTS.find((p) => p.id === championId) : null;
  const roundKey = live?.round ?? (phase === 'champion' ? 'champion' : phase === 'intro' ? 'r16' : phase);

  return (
    <PanelShell accent="#f59e0b">
      <style>{`
        @keyframes arenaPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes arenaInTop {
          from { opacity: 0; transform: translateY(-28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes arenaInBot {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes arenaVs {
          from { opacity: 0; transform: scale(0.6); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .arena-anim { animation: none !important; }
        }
      `}</style>

      {/* Phase ribbon */}
      <div style={{ padding: '14px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', color: '#fbbf24' }}>
              JIGADORES
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', color: '#fff', lineHeight: 1.1 }}>
              {ROUND_LABEL[roundKey]}
            </div>
          </div>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: live ? '#ef4444' : phase === 'champion' ? '#fbbf24' : '#64748b',
              boxShadow: live ? '0 0 12px #ef4444' : 'none',
              animation: live ? 'arenaPulse 1.4s ease-in-out infinite' : 'none',
            }}
            className="arena-anim"
          />
        </div>
        <RoundPips phase={phase} />
      </div>

      {phase === 'intro' && <IntroGrid />}
      {phase === 'champion' && champion && <ChampionBlock p={champion} />}
      {phase !== 'intro' && phase !== 'champion' && live && <DuelStack match={live} />}
      {phase !== 'intro' && phase !== 'champion' && !live && (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>A aguardar confronto…</div>
      )}

      {/* Footer context */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 14px 16px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
        }}
      >
        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(251,191,36,0.7)', marginBottom: 6 }}>
          ARENA DUEL
        </div>
        <div style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: phaseWidth(phase),
              background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>
    </PanelShell>
  );
}

function phaseWidth(phase: LabPhase): string {
  const map: Record<LabPhase, string> = {
    intro: '8%',
    r16: '25%',
    qf: '45%',
    sf: '70%',
    final: '88%',
    champion: '100%',
  };
  return map[phase];
}

function RoundPips({ phase }: { phase: LabPhase }) {
  const steps: LabPhase[] = ['r16', 'qf', 'sf', 'final', 'champion'];
  const idx = Math.max(0, steps.indexOf(phase === 'intro' ? 'r16' : phase));
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      {steps.map((s, i) => (
        <div
          key={s}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 99,
            background: i <= idx ? '#fbbf24' : 'rgba(255,255,255,0.12)',
            opacity: i === idx ? 1 : 0.55,
          }}
        />
      ))}
    </div>
  );
}

function IntroGrid() {
  return (
    <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {LAB_PARTICIPANTS.map((p, i) => (
        <div
          key={p.id}
          className="arena-anim"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            animation: `arenaInTop 0.45s ease ${i * 0.04}s both`,
          }}
        >
          <AvatarDisc p={p} size={28} />
          <span style={{ fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {truncateName(p.name, 10)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DuelStack({ match }: { match: LabMatch }) {
  return (
    <div style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <FighterCard p={match.a} score={match.scoreA} side="top" live={match.status === 'live'} />
      <div
        className="arena-anim"
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: '0.08em',
          color: '#0b1220',
          background: 'radial-gradient(circle at 30% 30%, #fde68a, #f59e0b)',
          boxShadow: '0 0 24px rgba(245,158,11,0.45)',
          animation: 'arenaVs 0.5s ease both',
        }}
      >
        VS
      </div>
      <FighterCard p={match.b} score={match.scoreB} side="bot" live={match.status === 'live'} />
      <div style={{ marginTop: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: match.status === 'live' ? '#f87171' : '#94a3b8' }}>
        {match.status === 'live' ? '● AO VIVO' : match.status === 'done' ? 'CONCLUÍDO' : 'PRÓXIMO'}
      </div>
    </div>
  );
}

function FighterCard({
  p,
  score,
  side,
  live,
}: {
  p: LabParticipant;
  score?: number;
  side: 'top' | 'bot';
  live: boolean;
}) {
  return (
    <div
      className="arena-anim"
      style={{
        width: '100%',
        padding: '14px 12px',
        borderRadius: 14,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
        border: `1px solid ${live ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.1)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animation: side === 'top' ? 'arenaInTop 0.55s ease both' : 'arenaInBot 0.55s ease both',
      }}
    >
      <AvatarDisc p={p} size={56} ring={live ? 'rgba(251,191,36,0.8)' : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: '#94a3b8' }}>SEED {p.seed}</div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {p.name}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', lineHeight: 1, minWidth: 28, textAlign: 'right' }}>
        {score ?? '–'}
      </div>
    </div>
  );
}

function ChampionBlock({ p }: { p: LabParticipant }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.28em', color: '#fbbf24', marginBottom: 16 }}>CAMPEÃO</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <AvatarDisc p={p} size={96} ring="#fbbf24" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.04em' }}>{p.name}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>JIGADORES TOURNAMENT</div>
    </div>
  );
}
