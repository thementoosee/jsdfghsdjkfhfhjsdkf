import type { BonusTournamentEntry } from './types';
import { FLOAT_GAP, FLOAT_RING, hashEntriesSeed, mulberry32 } from './entries-carousel';

export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';
export type DepthTier = 'far' | 'mid' | 'near';

/** Target simultaneous agents in the 288× field (with depth scaling). */
export const TARGET_VISIBLE = 20;

export interface DepthStyle {
  tier: DepthTier;
  avatar: number;
  fontSize: number;
  gap: number;
  h: number;
  opacity: number;
  z: number;
  nameMax: number;
}

export const DEPTH_STYLES: Record<DepthTier, DepthStyle> = {
  far: { tier: 'far', avatar: 34, fontSize: 12, gap: 7, h: 40, opacity: 0.78, z: 1, nameMax: 86 },
  mid: { tier: 'mid', avatar: 42, fontSize: 14, gap: 8, h: 48, opacity: 0.92, z: 2, nameMax: 100 },
  near: { tier: 'near', avatar: 50, fontSize: 15, gap: 9, h: 56, opacity: 1, z: 3, nameMax: 112 },
};

export interface CirculationAgent {
  slotId: string;
  entry: BonusTournamentEntry;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  depth: DepthStyle;
  wanderPhase: number;
  wanderSpeed: number;
  curvePhase: number;
  curveSpeed: number;
}

export interface CirculationQueueState {
  order: BonusTournamentEntry[];
  index: number;
  seed: number;
  cycle: number;
}

/** Always aim for TARGET_VISIBLE; visual repeats fill when uniqueCount < 20. */
export function concurrentAgentCount(uniqueCount: number): number {
  if (uniqueCount <= 0) return 0;
  return TARGET_VISIBLE;
}

export function allowsVisualRepeats(uniqueCount: number): boolean {
  return uniqueCount > 0 && uniqueCount < TARGET_VISIBLE;
}

export function depthForSlotIndex(i: number): DepthStyle {
  // ~40% far / 35% mid / 25% near — readable foreground, denser background
  const r = i % 20;
  if (r < 8) return DEPTH_STYLES.far;
  if (r < 15) return DEPTH_STYLES.mid;
  return DEPTH_STYLES.near;
}

export function createCirculationQueue(
  entries: BonusTournamentEntry[],
  seed = hashEntriesSeed(entries),
): CirculationQueueState {
  const rng = mulberry32(seed ^ 0xc1a7);
  const order = [...entries];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, index: 0, seed, cycle: 0 };
}

export function takeNextFromQueue(
  queue: CirculationQueueState,
  activeIds: Set<string>,
  uniqueCount: number,
): { entry: BonusTournamentEntry; queue: CirculationQueueState } {
  if (queue.order.length === 0) throw new Error('circulation queue empty');

  let q = queue;
  const preferUnseen =
    !allowsVisualRepeats(uniqueCount) || uniqueCount >= concurrentAgentCount(uniqueCount);

  for (let guard = 0; guard < q.order.length * 2 + 2; guard += 1) {
    if (q.index >= q.order.length) {
      const rng = mulberry32((q.seed + (q.cycle + 1) * 0x9e37) >>> 0);
      const order = [...q.order];
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      q = { ...q, order, index: 0, cycle: q.cycle + 1 };
    }

    const entry = q.order[q.index];
    q = { ...q, index: q.index + 1 };

    if (!preferUnseen) return { entry, queue: q };
    if (!activeIds.has(entry.twitchUserId)) return { entry, queue: q };
    if (guard >= q.order.length) return { entry, queue: q };
  }

  return { entry: q.order[0], queue: q };
}

export function estimateChipWidth(displayName: string, depth: DepthStyle, fieldW: number): number {
  const charW = depth.fontSize * 0.62;
  const textW = Math.min(depth.nameMax, Math.max(40, Math.round(displayName.length * charW)));
  const w = depth.avatar + depth.gap + textW + FLOAT_RING * 2;
  return Math.min(w, Math.max(depth.avatar + 48, fieldW - 8));
}

function randomVelocity(rng: () => number, speed: number): { vx: number; vy: number } {
  const angle = rng() * Math.PI * 2;
  const s = speed * (0.75 + rng() * 0.5);
  return { vx: Math.cos(angle) * s, vy: Math.sin(angle) * s };
}

/**
 * Spawn just outside an edge — used when recycling an exited agent.
 */
export function spawnAgentFromEdge(
  entry: BonusTournamentEntry,
  slotId: string,
  fieldW: number,
  fieldH: number,
  rng: () => number,
  preferSide?: EdgeSide,
  depth?: DepthStyle,
): CirculationAgent {
  const d = depth ?? depthForSlotIndex(Number(slotId.replace(/\D/g, '')) || 0);
  const w = estimateChipWidth(entry.displayName, d, fieldW);
  const h = d.h;
  const sides: EdgeSide[] = ['left', 'right', 'top', 'bottom'];
  const side = preferSide ?? sides[Math.floor(rng() * sides.length)];
  const speed = 16 + rng() * 20;
  const pad = 6;

  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  const midY = () => pad + rng() * Math.max(1, fieldH - h - pad * 2);
  const midX = () => pad + rng() * Math.max(1, fieldW - w - pad * 2);

  switch (side) {
    case 'left':
      x = -w - 4;
      y = midY();
      vx = speed * (0.7 + rng() * 0.5);
      vy = (rng() - 0.5) * speed * 0.9;
      break;
    case 'right':
      x = fieldW + 4;
      y = midY();
      vx = -speed * (0.7 + rng() * 0.5);
      vy = (rng() - 0.5) * speed * 0.9;
      break;
    case 'top':
      x = midX();
      y = -h - 4;
      vx = (rng() - 0.5) * speed * 0.95;
      vy = speed * (0.65 + rng() * 0.5);
      break;
    case 'bottom':
      x = midX();
      y = fieldH + 4;
      vx = (rng() - 0.5) * speed * 0.95;
      vy = -speed * (0.65 + rng() * 0.5);
      break;
  }

  const cx = fieldW / 2 - w / 2;
  const cy = fieldH / 2 - h / 2;
  vx += (cx - Math.max(0, Math.min(fieldW, x))) * 0.01;
  vy += (cy - Math.max(0, Math.min(fieldH, y))) * 0.01;

  return {
    slotId,
    entry,
    x,
    y,
    w,
    h,
    vx,
    vy,
    depth: d,
    wanderPhase: rng() * Math.PI * 2,
    wanderSpeed: 0.3 + rng() * 0.55,
    curvePhase: rng() * Math.PI * 2,
    curveSpeed: 0.18 + rng() * 0.4,
  };
}

/** Place agent already inside the field so density is immediately visible. */
export function spawnAgentInside(
  entry: BonusTournamentEntry,
  slotId: string,
  fieldW: number,
  fieldH: number,
  index: number,
  total: number,
  rng: () => number,
): CirculationAgent {
  const depth = depthForSlotIndex(index);
  const w = estimateChipWidth(entry.displayName, depth, fieldW);
  const h = depth.h;
  const cols = 4;
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = fieldW / cols;
  const cellH = fieldH / Math.max(1, rows);

  let x = col * cellW + rng() * Math.max(4, cellW - w - 6) + 2;
  let y = row * cellH + rng() * Math.max(4, cellH - h - 6) + 2;
  // Jitter off the cell grid so it never reads as a rigid matrix
  x += (rng() - 0.5) * 18;
  y += (rng() - 0.5) * 14;
  x = Math.min(fieldW - w - 2, Math.max(2, x));
  y = Math.min(fieldH - h - 2, Math.max(2, y));

  const { vx, vy } = randomVelocity(rng, 14 + rng() * 18);

  return {
    slotId,
    entry,
    x,
    y,
    w,
    h,
    vx,
    vy,
    depth,
    wanderPhase: rng() * Math.PI * 2,
    wanderSpeed: 0.3 + rng() * 0.55,
    curvePhase: rng() * Math.PI * 2,
    curveSpeed: 0.18 + rng() * 0.4,
  };
}

export function isFullyExited(
  agent: CirculationAgent,
  fieldW: number,
  fieldH: number,
  margin = 4,
): boolean {
  return (
    agent.x + agent.w < -margin ||
    agent.x > fieldW + margin ||
    agent.y + agent.h < -margin ||
    agent.y > fieldH + margin
  );
}

/** True if any part of the chip intersects the field (counts toward visible density). */
export function isPartiallyVisible(
  agent: CirculationAgent,
  fieldW: number,
  fieldH: number,
): boolean {
  return !(
    agent.x + agent.w <= 0 ||
    agent.x >= fieldW ||
    agent.y + agent.h <= 0 ||
    agent.y >= fieldH
  );
}

export function stepAgents(
  agents: CirculationAgent[],
  dt: number,
  fieldW: number,
  fieldH: number,
): CirculationAgent[] {
  const next = agents.map((a) => {
    const wander = Math.sin(a.wanderPhase) * 11;
    const curve = Math.cos(a.curvePhase) * 9;
    let vx = a.vx + wander * 0.14;
    let vy = a.vy + curve * 0.14;
    const sp = Math.hypot(vx, vy);
    const maxSp = a.depth.tier === 'far' ? 42 : a.depth.tier === 'mid' ? 38 : 34;
    const minSp = 12;
    if (sp > maxSp) {
      vx = (vx / sp) * maxSp;
      vy = (vy / sp) * maxSp;
    } else if (sp < minSp && sp > 0.01) {
      vx = (vx / sp) * minSp;
      vy = (vy / sp) * minSp;
    }
    return {
      ...a,
      x: a.x + vx * dt,
      y: a.y + vy * dt,
      vx,
      vy,
      wanderPhase: a.wanderPhase + a.wanderSpeed * dt,
      curvePhase: a.curvePhase + a.curveSpeed * dt,
    };
  });

  // Soft repulsion — scales with avatar size (depth)
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i];
      const b = next[j];
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;
      const bcx = b.x + b.w / 2;
      const bcy = b.y + b.h / 2;
      const dx = acx - bcx;
      const dy = acy - bcy;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = (a.depth.avatar + b.depth.avatar) * 0.55 + FLOAT_GAP + 10;
      if (dist >= minDist) continue;
      const push = ((minDist - dist) / minDist) * 28 * dt;
      const nx = dx / dist;
      const ny = dy / dist;
      next[i] = {
        ...next[i],
        vx: next[i].vx + nx * push,
        vy: next[i].vy + ny * push,
        x: next[i].x + nx * push * 0.4,
        y: next[i].y + ny * push * 0.4,
      };
      next[j] = {
        ...next[j],
        vx: next[j].vx - nx * push,
        vy: next[j].vy - ny * push,
        x: next[j].x - nx * push * 0.4,
        y: next[j].y - ny * push * 0.4,
      };
    }
  }

  void fieldW;
  void fieldH;
  return next;
}

export function bootstrapAgents(
  entries: BonusTournamentEntry[],
  fieldW: number,
  fieldH: number,
): { agents: CirculationAgent[]; queue: CirculationQueueState } {
  const n = entries.length;
  const slots = concurrentAgentCount(n);
  let queue = createCirculationQueue(entries);
  const agents: CirculationAgent[] = [];
  const rng = mulberry32(hashEntriesSeed(entries) ^ 0xb007);
  const active = new Set<string>();

  for (let i = 0; i < slots; i += 1) {
    const { entry, queue: q2 } = takeNextFromQueue(queue, active, n);
    queue = q2;
    if (!allowsVisualRepeats(n)) active.add(entry.twitchUserId);
    // Majority start inside so density is immediate; a few enter from edges
    if (i < Math.floor(slots * 0.75)) {
      agents.push(spawnAgentInside(entry, `circ-${i}`, fieldW, fieldH, i, slots, rng));
    } else {
      const sides: EdgeSide[] = ['left', 'right', 'top', 'bottom'];
      const agent = spawnAgentFromEdge(
        entry,
        `circ-${i}`,
        fieldW,
        fieldH,
        rng,
        sides[i % sides.length],
        depthForSlotIndex(i),
      );
      const t = 0.2 + rng() * 0.8;
      agent.x += agent.vx * t;
      agent.y += agent.vy * t;
      agents.push(agent);
    }
  }

  return { agents, queue };
}

export function nameMaxForAgent(agent: CirculationAgent): number {
  return Math.max(36, agent.w - agent.depth.avatar - agent.depth.gap - FLOAT_RING * 2);
}
