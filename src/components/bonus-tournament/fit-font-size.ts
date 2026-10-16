/**
 * Pure font-fit helpers for AutoFitNumber.
 *
 * Strategy:
 * 1. Prefer the approved max font size when the text fits.
 * 2. Binary-search down to minFontSize while measuring with canvas measureText.
 * 3. If still wider at minFontSize, keep the full string and return scaleX < 1
 *    (horizontal squeeze). Never ellipsize or truncate digits.
 *
 * Limitation: values that need scaleX below ~0.55 become hard to read at 288px.
 * Prefer showing the full number squeezed rather than inventing abbreviations.
 */

export interface FitFontSizeInput {
  text: string;
  maxWidth: number;
  maxFontSize: number;
  minFontSize: number;
  /** Returns rendered text width at the given font size (px). */
  measure: (fontSize: number) => number;
  /** Soft floor for scaleX; below this we still scale but mark as cramped. */
  minScaleX?: number;
}

export interface FitFontSizeResult {
  fontSize: number;
  /** Additional horizontal scale applied after fontSize (usually 1). */
  scaleX: number;
  /** True when even minFontSize + minScaleX cannot fit without further squeeze. */
  cramped: boolean;
}

export function fitFontSize(input: FitFontSizeInput): FitFontSizeResult {
  const { text, maxWidth, maxFontSize, minFontSize, measure } = input;
  const minScaleX = input.minScaleX ?? 0.55;

  if (!text || maxWidth <= 0 || maxFontSize <= 0) {
    return { fontSize: Math.max(minFontSize, 1), scaleX: 1, cramped: false };
  }

  const maxW = measure(maxFontSize);
  if (maxW <= maxWidth) {
    return { fontSize: maxFontSize, scaleX: 1, cramped: false };
  }

  let lo = minFontSize;
  let hi = maxFontSize;
  let best = minFontSize;

  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (measure(mid) <= maxWidth) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Prefer a slightly smaller size that fits over one that barely overflows.
  const fitted = measure(best) <= maxWidth ? best : minFontSize;
  if (measure(fitted) <= maxWidth && fitted > minFontSize + 0.05) {
    return { fontSize: Math.round(fitted * 100) / 100, scaleX: 1, cramped: false };
  }

  const atMin = measure(minFontSize);
  if (atMin <= maxWidth) {
    return { fontSize: minFontSize, scaleX: 1, cramped: false };
  }

  const scaleX = Math.min(1, maxWidth / atMin);
  return {
    fontSize: minFontSize,
    scaleX,
    cramped: scaleX < minScaleX,
  };
}

let sharedCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const canvas = document.createElement('canvas');
  sharedCtx = canvas.getContext('2d');
  return sharedCtx;
}

/** Measure text width with the overlay number typeface. */
export function measureTabularText(
  text: string,
  fontSize: number,
  fontWeight: number | string = 900,
  fontFamily = '"Rubik", "Segoe UI", system-ui, sans-serif',
): number {
  const ctx = getMeasureCtx();
  if (!ctx) {
    // SSR / no canvas — approximate with average glyph width.
    return text.length * fontSize * 0.62;
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}
