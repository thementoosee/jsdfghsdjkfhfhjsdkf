import { useMemo, useState } from 'react';
import { BonusTournamentBracketOverlay } from './BonusTournamentBracketOverlay';
import {
  BRACKET_DEMO_STAGES,
  BRACKET_OVERLAY_H,
  BRACKET_OVERLAY_W,
  buildDemoBracketView,
  type BracketDemoStage,
} from './bracket-structure';

/**
 * Local DEMO visual lab — horizontal bracket 1288×720.
 * Stage selector is preview-only and never touches Manager tournament state.
 */
export function BracketVisualPreview() {
  const [stage, setStage] = useState<BracketDemoStage>('qf');
  const [key, setKey] = useState(0);
  const view = useMemo(() => buildDemoBracketView(stage), [stage, key]);

  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #1a2336 0%, #0a0e14 55%)',
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        color: '#e2e8f0',
        padding: '28px 24px 48px',
      }}
    >
      <div className="w-full" style={{ maxWidth: BRACKET_OVERLAY_W + 48 }}>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              className="text-[11px] font-black uppercase tracking-[0.28em]"
              style={{ color: '#fbbf24' }}
            >
              Bonus Tournament · Design Lab
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-wide">
              Bracket — Preview DEMO
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#94a3b8' }}>
              Dados sintéticos · {BRACKET_OVERLAY_W}×{BRACKET_OVERLAY_H}px · área central do jogo
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setStage('qf');
              setKey((k) => k + 1);
            }}
            className="px-4 py-2 text-xs font-black uppercase tracking-wider rounded-md"
            style={{
              background: 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.4)',
              color: '#fbbf24',
            }}
          >
            Reset DEMO
          </button>
        </header>

        <div
          className="flex flex-wrap gap-2 mb-5 p-3 rounded-xl"
          style={{
            background: 'rgba(15,23,42,0.65)',
            border: '1px solid rgba(148,163,184,0.15)',
          }}
        >
          {BRACKET_DEMO_STAGES.map((s) => {
            const active = s.id === stage;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStage(s.id);
                  setKey((k) => k + 1);
                }}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-md"
                style={{
                  background: active ? 'rgba(251,191,36,0.22)' : 'rgba(30,41,59,0.6)',
                  border: `1px solid ${active ? 'rgba(251,191,36,0.55)' : 'rgba(148,163,184,0.18)'}`,
                  color: active ? '#fbbf24' : '#94a3b8',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex justify-center overflow-x-auto">
          <div
            style={{
              width: BRACKET_OVERLAY_W,
              height: BRACKET_OVERLAY_H,
              borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Keep mounted across stages so qualification advance animates; Reset remounts. */}
            <BonusTournamentBracketOverlay key={key} view={view} demoBadge />
          </div>
        </div>
      </div>
    </div>
  );
}
