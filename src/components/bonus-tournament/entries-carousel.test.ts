import { describe, expect, it } from 'vitest';
import { buildDemoEntries, getEntriesRemainingSeconds, defaultEntriesConfig } from './demo-data';
import {
  buildCarouselRows,
  buildVisualPool,
  fitAmplitudeX,
  formatEntriesTimer,
  layoutFloatingUnits,
  pickRotatedEntries,
  retargetUnitToMeasuredWidth,
  targetSlotsPerRow,
  targetVisualCount,
  FLOAT_MAX_VISIBLE,
  FLOAT_SAFE_MARGIN,
} from './entries-carousel';

describe('entries floating / carousel helpers', () => {
  it('fills visual pool for 3 entries without mutating unique count', () => {
    const entries = buildDemoEntries(3);
    const pool = buildVisualPool(entries);
    expect(entries).toHaveLength(3);
    expect(pool.length).toBeGreaterThanOrEqual(6);
    expect(pool.length).toBeLessThanOrEqual(FLOAT_MAX_VISIBLE);
    expect(new Set(pool.map((e) => e.twitchUserId)).size).toBe(3);
  });

  it('does not artificially pad when there are 20+ unique entries', () => {
    const entries = buildDemoEntries(20);
    expect(targetVisualCount(20)).toBe(20);
    expect(targetSlotsPerRow(20)).toBe(20);
    const pool = buildVisualPool(entries);
    expect(pool).toHaveLength(20);
    expect(new Set(pool.map((e) => e.twitchUserId)).size).toBe(20);
  });

  it('layouts units fully inside safe margins including amplitude', () => {
    const entries = buildDemoEntries(8);
    const fieldW = 266;
    const fieldH = 500;
    const a = layoutFloatingUnits(entries, fieldW, fieldH);
    const b = layoutFloatingUnits(entries, fieldW, fieldH);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(FLOAT_MAX_VISIBLE);
    expect(a.map((u) => `${u.slotId}:${u.x}:${u.y}`)).toEqual(b.map((u) => `${u.slotId}:${u.x}:${u.y}`));

    for (const u of a) {
      expect(u.ampY).toBeGreaterThanOrEqual(0);
      expect(u.ampY).toBeLessThanOrEqual(12.01);
      expect(u.x - u.ampX).toBeGreaterThanOrEqual(FLOAT_SAFE_MARGIN - 0.01);
      expect(u.x + u.w + u.ampX).toBeLessThanOrEqual(fieldW - FLOAT_SAFE_MARGIN + 0.01);
      expect(u.y - u.ampY).toBeGreaterThanOrEqual(FLOAT_SAFE_MARGIN - 0.01);
      expect(u.y + u.h + u.ampY).toBeLessThanOrEqual(fieldH - FLOAT_SAFE_MARGIN - 10 + 0.01);
    }
  });

  it('reduces amp when a chip is near the edge', () => {
    expect(fitAmplitudeX(14, 160, 266, 40)).toBe(0);
    expect(fitAmplitudeX(40, 160, 266, 40)).toBeLessThanOrEqual(26);
  });

  it('retargets measured width without leaving the field', () => {
    const entries = buildDemoEntries(3);
    const [unit] = layoutFloatingUnits(entries, 266, 500);
    const next = retargetUnitToMeasuredWidth(unit, unit.w + 40, 266, 500);
    expect(next.x - next.ampX).toBeGreaterThanOrEqual(FLOAT_SAFE_MARGIN - 0.01);
    expect(next.x + next.w + next.ampX).toBeLessThanOrEqual(266 - FLOAT_SAFE_MARGIN + 0.01);
  });

  it('keeps long nicknames inside the field', () => {
    const long = buildDemoEntries(3).map((e, i) =>
      i === 0
        ? { ...e, displayName: 'SuperLongTwitchNickname_XYZ' }
        : e,
    );
    const units = layoutFloatingUnits(long, 266, 500);
    for (const u of units) {
      expect(u.x - u.ampX).toBeGreaterThanOrEqual(FLOAT_SAFE_MARGIN - 0.01);
      expect(u.x + u.w + u.ampX).toBeLessThanOrEqual(266 - FLOAT_SAFE_MARGIN + 0.01);
    }
  });

  it('rotates pool entries across fixed slots', () => {
    const entries = buildDemoEntries(20);
    const a = pickRotatedEntries(entries, 12, 0);
    const b = pickRotatedEntries(entries, 12, 5);
    expect(a).toHaveLength(12);
    expect(b).toHaveLength(12);
    expect(a.map((e) => e.twitchUserId)).not.toEqual(b.map((e) => e.twitchUserId));
  });

  it('legacy rows still fill for few entries', () => {
    const entries = buildDemoEntries(3);
    const rows = buildCarouselRows(entries, 4);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('formats timer as mm:ss', () => {
    expect(formatEntriesTimer(272)).toBe('04:32');
    expect(formatEntriesTimer(0)).toBe('00:00');
  });

  it('computes remaining seconds from start reference', () => {
    const started = Date.now() - 90_000;
    const rem = getEntriesRemainingSeconds(
      defaultEntriesConfig({
        durationSeconds: 300,
        timerStartedAt: started,
        timerPaused: false,
        entriesOpen: true,
      }),
      started + 90_000,
    );
    expect(rem).toBe(210);
  });
});
