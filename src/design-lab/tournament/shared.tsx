import type { CSSProperties, ReactNode } from 'react';
import type { LabParticipant } from './types';
import { MAIN_OVERLAY_SIDEBAR_WIDTH_PX } from '../../lib/overlay-layout';

export const LAB_PANEL_W = MAIN_OVERLAY_SIDEBAR_WIDTH_PX;
export const LAB_PANEL_H = 720;

export function AvatarDisc({
  p,
  size = 48,
  dimmed = false,
  ring,
}: {
  p: LabParticipant;
  size?: number;
  dimmed?: boolean;
  ring?: string;
}) {
  const initials = p.name.slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.32,
        fontWeight: 900,
        letterSpacing: '0.04em',
        color: '#f8fafc',
        background: `linear-gradient(145deg, hsl(${p.avatarHue} 55% 38%), hsl(${(p.avatarHue + 40) % 360} 45% 18%))`,
        boxShadow: ring ? `0 0 0 2px ${ring}` : 'inset 0 1px 0 rgba(255,255,255,0.18)',
        opacity: dimmed ? 0.45 : 1,
        filter: dimmed ? 'grayscale(0.7)' : 'none',
        transition: 'opacity 0.35s ease, filter 0.35s ease',
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function PanelShell({
  children,
  accent = '#7c3aed',
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="lab-panel"
      style={{
        width: LAB_PANEL_W,
        height: LAB_PANEL_H,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.12)',
        background:
          'linear-gradient(165deg, #0b1220 0%, #101a2e 45%, #0a1020 100%)',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 40px ${accent}22`,
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        color: '#e2e8f0',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function truncateName(name: string, max = 12): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}
