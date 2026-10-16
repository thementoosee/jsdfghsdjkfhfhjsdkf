import { describe, expect, it } from 'vitest';
import { fitFontSize } from './fit-font-size';

/** Linear stand-in for measureText: width ≈ chars × fontSize × 0.6 */
function fakeMeasure(text: string) {
  return (fontSize: number) => text.length * fontSize * 0.6;
}

describe('fitFontSize', () => {
  it('keeps max size when text fits', () => {
    const text = '€6.00';
    const r = fitFontSize({
      text,
      maxWidth: 80,
      maxFontSize: 14,
      minFontSize: 7,
      measure: fakeMeasure(text),
    });
    expect(r.fontSize).toBe(14);
    expect(r.scaleX).toBe(1);
    expect(r.cramped).toBe(false);
  });

  it('reduces font size for medium values without scaleX', () => {
    const text = '€12500.00';
    const r = fitFontSize({
      text,
      maxWidth: 70,
      maxFontSize: 14,
      minFontSize: 7,
      measure: fakeMeasure(text),
    });
    expect(r.fontSize).toBeLessThan(14);
    expect(r.fontSize).toBeGreaterThanOrEqual(7);
    expect(r.scaleX).toBe(1);
  });

  it('uses scaleX for extreme values instead of truncating', () => {
    const text = '€1250000.00';
    const r = fitFontSize({
      text,
      maxWidth: 40,
      maxFontSize: 14,
      minFontSize: 7,
      measure: fakeMeasure(text),
    });
    expect(r.fontSize).toBe(7);
    expect(r.scaleX).toBeLessThan(1);
    // Full string preserved by caller — fit only returns metrics
    expect(text).toBe('€1250000.00');
  });

  it('marks cramped when scaleX drops below soft floor', () => {
    const text = '125000.00x';
    const r = fitFontSize({
      text,
      maxWidth: 20,
      maxFontSize: 14,
      minFontSize: 7,
      minScaleX: 0.55,
      measure: fakeMeasure(text),
    });
    expect(r.cramped).toBe(true);
    expect(r.scaleX).toBeLessThan(0.55);
  });
});
