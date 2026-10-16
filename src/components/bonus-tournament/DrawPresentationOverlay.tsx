import { getMainOverlayCasinoCutout } from '../../lib/overlay-layout';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import type { DrawPublicSnapshot } from './draw-types';

const CUTOUT = getMainOverlayCasinoCutout(true);

/**
 * Scaffold for the FUTURE main-area bracket (1288×720).
 * Participant roulette lives on the sidebar (`DrawSidebarOverlay`) — not here.
 */
export function DrawPresentationOverlay({
  snapshot,
  fill = 'casino',
}: {
  snapshot: DrawPublicSnapshot | null;
  fill?: 'casino' | 'fluid';
  /** @deprecated Preview-only props kept for call-site compatibility */
  decorPool?: unknown;
  demoBadge?: boolean;
  forceProgress?: number;
}) {
  const w = fill === 'casino' ? CUTOUT.width : '100%';
  const h = fill === 'casino' ? CUTOUT.height : '100%';

  return (
    <div
      className="relative overflow-hidden flex flex-col items-center justify-center"
      style={{
        width: w,
        height: h,
        borderRadius: fill === 'casino' ? CUTOUT.radius : 0,
        border: fill === 'casino' ? '1px solid rgba(255,255,255,0.10)' : 'none',
        background: 'linear-gradient(168deg, #070d18 0%, #0c1528 42%, #080e1a 100%)',
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        color: '#e2e8f0',
      }}
    >
      <ArenaAtmosphere />
      <div className="relative z-10 text-center px-10 max-w-2xl">
        <div
          className="text-[12px] font-black uppercase tracking-[0.32em]"
          style={{ color: '#fbbf24' }}
        >
          Bonus Tournament
        </div>
        <h1 className="mt-4 text-4xl font-black uppercase tracking-wide" style={{ color: '#f8fafc' }}>
          Bracket
        </h1>
        <p className="mt-3 text-sm font-semibold" style={{ color: '#94a3b8' }}>
          Área principal {CUTOUT.width}×{CUTOUT.height} — reservada para o bracket completo
          (fase visual seguinte).
        </p>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>
          Roleta e escolha de slot → overlay lateral 288×720
          {snapshot?.tournamentName ? ` · ${snapshot.tournamentName}` : ''}
        </p>
      </div>
    </div>
  );
}
