import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAW_TIMING } from './draw-timing';

describe('draw-timing single source', () => {
  it('matches draw-timing.json and Edge _shared/bt-draw.ts DRAW_TIMING', () => {
    const root = process.cwd();
    const fromJson = JSON.parse(
      readFileSync(resolve(root, 'supabase/functions/_shared/draw-timing.json'), 'utf8'),
    ) as typeof DRAW_TIMING;
    expect(DRAW_TIMING).toEqual(fromJson);

    const edgeSrc = readFileSync(
      resolve(root, 'supabase/functions/_shared/bt-draw.ts'),
      'utf8',
    );
    for (const [key, value] of Object.entries(DRAW_TIMING)) {
      expect(edgeSrc).toMatch(new RegExp(`${key}:\\s*${value}`));
    }
  });
});
