import { useMemo, useState } from 'react';
import { DrawSidebarOverlay } from './DrawSidebarOverlay';
import {
  DRAW_PREVIEW_SCENES,
  buildDemoDrawSnapshot,
  demoDecorPool,
  previewForceProgress,
  type DrawPreviewScene,
} from './draw-demo-snapshots';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';

const W = MAIN_OVERLAY_SIDEBAR_WIDTH_PX;
const H = 720;

/**
 * Local DEMO visual lab — SIDEBAR 288×720 draw ceremony.
 * Phase selector is preview-only.
 */
export function DrawVisualPreview() {
  const [scene, setScene] = useState<DrawPreviewScene>('roulette');
  const [key, setKey] = useState(0);
  const snapshot = useMemo(() => buildDemoDrawSnapshot(scene), [scene, key]);
  const decor = useMemo(() => demoDecorPool(), []);
  const forceProgress = previewForceProgress(scene);

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
      <div className="w-full max-w-[720px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              className="text-[11px] font-black uppercase tracking-[0.28em]"
              style={{ color: '#fbbf24' }}
            >
              Bonus Tournament · Design Lab
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-wide">
              Sorteio lateral — Preview DEMO
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#94a3b8' }}>
              Dados sintéticos · {W}×{H}px · overlay lateral (não é a área 1288)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setKey((k) => k + 1)}
            className="px-4 py-2 text-xs font-black uppercase tracking-wider rounded-md"
            style={{
              background: 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.4)',
              color: '#fbbf24',
            }}
          >
            Replay cena
          </button>
        </header>

        <div
          className="flex flex-wrap gap-2 mb-5 p-3 rounded-xl"
          style={{
            background: 'rgba(15,23,42,0.65)',
            border: '1px solid rgba(148,163,184,0.15)',
          }}
        >
          {DRAW_PREVIEW_SCENES.map((s) => {
            const active = s.id === scene;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScene(s.id);
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

        <div className="flex justify-center">
          <div
            style={{
              width: W,
              height: H,
              borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              overflow: 'hidden',
            }}
          >
            <DrawSidebarOverlay
              key={`${scene}-${key}`}
              snapshot={snapshot}
              decorPool={decor}
              demoBadge
              forceProgress={forceProgress}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
