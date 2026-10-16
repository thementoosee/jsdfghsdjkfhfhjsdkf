import { useMemo, useState } from 'react';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';
import { liveMatch, matchesForPhase } from './mock-data';
import type { LabPhase } from './types';
import { PHASE_ORDER } from './types';
import { ArenaDuel } from './concepts/ArenaDuel';
import { SignalRail } from './concepts/SignalRail';
import { CrownPath } from './concepts/CrownPath';
import { LAB_PANEL_H } from './shared';

type ConceptId = 'arena' | 'signal' | 'crown';

const CONCEPTS: { id: ConceptId; name: string; tagline: string; accent: string }[] = [
  {
    id: 'arena',
    name: 'ARENA DUEL',
    tagline: 'Fight-card vertical — um duelo domina a coluna',
    accent: '#fbbf24',
  },
  {
    id: 'signal',
    name: 'SIGNAL RAIL',
    tagline: 'Broadcast editorial — rail de progresso + board limpo',
    accent: '#22d3ee',
  },
  {
    id: 'crown',
    name: 'CROWN PATH',
    tagline: 'Ascensão — caminho até à coroa, trail de eliminados',
    accent: '#a78bfa',
  },
];

const PHASE_LABEL: Record<LabPhase, string> = {
  intro: 'Início (16)',
  r16: 'Oitavos',
  qf: 'Quartos',
  sf: 'Meias',
  final: 'Final',
  champion: 'Campeão',
};

/**
 * Isolated Tournament Mode design laboratory.
 * Does not touch production overlays, hunt, opening, or existing Fever Champions.
 */
export function TournamentDesignLab() {
  const [concept, setConcept] = useState<ConceptId>('arena');
  const [phase, setPhase] = useState<LabPhase>('r16');
  const [compare, setCompare] = useState(false);

  const snapshot = useMemo(() => matchesForPhase(phase), [phase]);
  const live = liveMatch(snapshot.matches, snapshot.liveMatchId);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #152238 0%, #070b14 55%)',
        color: '#e2e8f0',
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        padding: '28px 32px 48px',
      }}
    >
      <header style={{ maxWidth: 1280, margin: '0 auto 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', color: '#94a3b8' }}>
          DESIGN LAB · ISOLADO · NÃO LIGA A PRODUÇÃO
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '8px 0 6px', letterSpacing: '-0.02em' }}>
          Tournament Mode — 3 direções
        </h1>
        <p style={{ margin: 0, maxWidth: 720, color: '#94a3b8', fontSize: 14, lineHeight: 1.5 }}>
          Coluna esquerda real: <strong style={{ color: '#e2e8f0' }}>{MAIN_OVERLAY_SIDEBAR_WIDTH_PX}×{LAB_PANEL_H}px</strong>.
          Troca o conceito e a fase. Nada disto altera Bonus Hunt, Opening, Chill ou o Fever Champions atual.
        </p>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {CONCEPTS.map((c) => {
          const on = concept === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setConcept(c.id)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: on ? `1px solid ${c.accent}` : '1px solid rgba(255,255,255,0.1)',
                background: on ? `${c.accent}18` : 'rgba(255,255,255,0.03)',
                color: '#e2e8f0',
                cursor: 'pointer',
                minWidth: 220,
                flex: '1 1 220px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.06em', color: c.accent }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{c.tagline}</div>
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto 18px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#64748b', marginRight: 4 }}>FASE</span>
        {PHASE_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: phase === p ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)',
              background: phase === p ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: '#e2e8f0',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCompare((v) => !v)}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            background: compare ? 'rgba(251,191,36,0.15)' : 'transparent',
            color: '#fbbf24',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {compare ? 'VER UM' : 'COMPARAR 3'}
        </button>
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 28,
          justifyContent: compare ? 'flex-start' : 'center',
          alignItems: 'flex-start',
        }}
      >
        {(compare ? CONCEPTS : CONCEPTS.filter((c) => c.id === concept)).map((c) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: c.accent }}>{c.name}</div>
            <div
              style={{
                padding: 12,
                borderRadius: 20,
                background: 'rgba(0,0,0,0.35)',
                border: '1px dashed rgba(255,255,255,0.12)',
              }}
            >
              {c.id === 'arena' && (
                <ArenaDuel phase={phase} live={live} championId={snapshot.championId} />
              )}
              {c.id === 'signal' && (
                <SignalRail
                  phase={phase}
                  live={live}
                  matches={snapshot.matches}
                  championId={snapshot.championId}
                />
              )}
              {c.id === 'crown' && (
                <CrownPath phase={phase} live={live} championId={snapshot.championId} />
              )}
            </div>
            <ConceptNotes id={c.id} />
          </div>
        ))}
      </div>

      <section
        style={{
          maxWidth: 1280,
          margin: '40px auto 0',
          padding: 20,
          borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px' }}>Espaço real analisado</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
          <li>
            Sidebar: <code style={{ color: '#e2e8f0' }}>{MAIN_OVERLAY_SIDEBAR_WIDTH_PX}px</code> × painel{' '}
            <code style={{ color: '#e2e8f0' }}>720px</code> (mesmo token do Bonus Hunt / Opening).
          </li>
          <li>
            Main stream: hunt / opening / chill / tournament trocam só a coluna esquerda via{' '}
            <code style={{ color: '#e2e8f0' }}>MainStreamOverlay</code>.
          </li>
          <li>
            Fever Champions / Bracket existentes <strong style={{ color: '#e2e8f0' }}>não foram alterados</strong> —
            este lab é rota isolada <code style={{ color: '#e2e8f0' }}>/tournament-lab</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ConceptNotes({ id }: { id: ConceptId }) {
  const notes: Record<ConceptId, string[]> = {
    arena: [
      'Filosofia: poster de arena / fight-card.',
      'Confronto: A empilhado sobre B com gem VS.',
      'Progresso: pips de ronda + barra inferior.',
      'OBS: tipografia grande, poucos elementos.',
    ],
    signal: [
      'Filosofia: masthead de broadcast desportivo.',
      'Confronto: split board editorial com scores.',
      'Progresso: rail vertical (termómetro de fases).',
      'OBS: rail permanente = orientação instantânea.',
    ],
    crown: [
      'Filosofia: ascensão até à coroa.',
      'Confronto: duelo no meio do caminho.',
      'Progresso: nós R16→QF→SF→F + trail eliminados.',
      'OBS: metáfora clara sem bracket comprimido.',
    ],
  };

  return (
    <ul style={{ margin: 0, paddingLeft: 16, maxWidth: MAIN_OVERLAY_SIDEBAR_WIDTH_PX + 24, color: '#94a3b8', fontSize: 11, lineHeight: 1.45 }}>
      {notes[id].map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}
