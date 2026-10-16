import { describe, expect, it } from 'vitest';
import { buildDemoEntries } from './demo-data';
import {
  TARGET_VISIBLE,
  allowsVisualRepeats,
  bootstrapAgents,
  concurrentAgentCount,
  createCirculationQueue,
  isFullyExited,
  isPartiallyVisible,
  spawnAgentFromEdge,
  stepAgents,
  takeNextFromQueue,
} from './entries-circulation';

describe('entries circulation', () => {
  it('targets 20 concurrent agents with visual repeats under 20 uniques', () => {
    expect(concurrentAgentCount(1)).toBe(TARGET_VISIBLE);
    expect(concurrentAgentCount(3)).toBe(TARGET_VISIBLE);
    expect(concurrentAgentCount(18)).toBe(TARGET_VISIBLE);
    expect(concurrentAgentCount(100)).toBe(TARGET_VISIBLE);
    expect(allowsVisualRepeats(3)).toBe(true);
    expect(allowsVisualRepeats(20)).toBe(false);
  });

  it('bootstraps 20 agents for many uniques with depth tiers', () => {
    const entries = buildDemoEntries(100);
    const { agents, queue } = bootstrapAgents(entries, 266, 520);
    expect(agents).toHaveLength(TARGET_VISIBLE);
    expect(queue.order).toHaveLength(100);
    const ids = new Set(agents.map((a) => a.entry.twitchUserId));
    expect(ids.size).toBe(TARGET_VISIBLE);
    const tiers = new Set(agents.map((a) => a.depth.tier));
    expect(tiers.has('far')).toBe(true);
    expect(tiers.has('near')).toBe(true);
    const visible = agents.filter((a) => isPartiallyVisible(a, 266, 520));
    expect(visible.length).toBeGreaterThanOrEqual(14);
  });

  it('fills density with visual repeats when few uniques', () => {
    const entries = buildDemoEntries(3);
    const { agents } = bootstrapAgents(entries, 266, 520);
    expect(agents).toHaveLength(TARGET_VISIBLE);
    expect(new Set(agents.map((a) => a.entry.twitchUserId)).size).toBe(3);
  });

  it('cycles through uniques before reshuffling', () => {
    const entries = buildDemoEntries(20);
    let queue = createCirculationQueue(entries);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const { entry, queue: q2 } = takeNextFromQueue(queue, seen, 20);
      queue = q2;
      expect(seen.has(entry.twitchUserId)).toBe(false);
      seen.add(entry.twitchUserId);
    }
    expect(seen.size).toBe(20);
  });

  it('detects full exit past field edges', () => {
    const entries = buildDemoEntries(3);
    const agent = spawnAgentFromEdge(entries[0], 'circ-0', 266, 500, () => 0.4, 'left');
    agent.x = -agent.w - 10;
    expect(isFullyExited(agent, 266, 500)).toBe(true);
    agent.x = 40;
    agent.y = 40;
    expect(isFullyExited(agent, 266, 500)).toBe(false);
  });

  it('steps agents without NaN positions', () => {
    const entries = buildDemoEntries(20);
    const { agents } = bootstrapAgents(entries, 266, 520);
    const next = stepAgents(agents, 0.016, 266, 520);
    expect(next).toHaveLength(TARGET_VISIBLE);
    for (const a of next) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }
  });
});
