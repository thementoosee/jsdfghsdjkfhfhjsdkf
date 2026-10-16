import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fitFontSize, measureTabularText } from './fit-font-size';

export interface AutoFitNumberProps {
  value: string;
  /** Approved size used when the value fits. */
  maxFontSize: number;
  /** Smallest legible size before optional scaleX squeeze. Default 7. */
  minFontSize?: number;
  color: string;
  fontWeight?: number | string;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

/**
 * Numeric text that shrinks to the container width via real measureText + ResizeObserver.
 * Never uses ellipsis; never truncates digits / € / x.
 *
 * Limitation: when even minFontSize cannot fit, a horizontal scaleX squeeze is applied
 * so the full value stays visible. Below ~0.55 scale the glyph becomes hard to read at 288px
 * — prefer that over inventing abbreviations or cutting digits.
 */
export function AutoFitNumber({
  value,
  maxFontSize,
  minFontSize = 7,
  color,
  fontWeight = 900,
  className,
  title,
  style,
}: AutoFitNumberProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [scaleX, setScaleX] = useState(1);
  const [cramped, setCramped] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const textEl = textRef.current;
    if (!el || !textEl) return;

    const apply = () => {
      const width = el.clientWidth;
      if (width <= 0) {
        setReady(false);
        return;
      }

      // Slightly under-commit vs canvas — Rubik black can render wider than measureText.
      const budget = Math.max(1, width - 2);

      const result = fitFontSize({
        text: value,
        maxWidth: budget,
        maxFontSize,
        minFontSize,
        measure: (size) => measureTabularText(value, size, fontWeight),
      });

      // Apply candidate sizes to the real node and correct with scrollWidth.
      textEl.style.fontSize = `${result.fontSize}px`;
      textEl.style.transform = 'none';

      let fs = result.fontSize;
      let guard = 0;
      while (textEl.scrollWidth > budget && fs > minFontSize && guard < 40) {
        fs = Math.max(minFontSize, fs - 0.25);
        textEl.style.fontSize = `${fs}px`;
        guard += 1;
      }

      let nextScale = 1;
      if (textEl.scrollWidth > budget) {
        nextScale = budget / textEl.scrollWidth;
        textEl.style.transform = `scaleX(${nextScale})`;
      }

      const nextCramped = nextScale < 0.55;
      setFontSize(fs);
      setScaleX(nextScale);
      setCramped(nextCramped);
      setReady(true);
    };

    apply();

    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, maxFontSize, minFontSize, fontWeight]);

  const tip =
    title ??
    (cramped
      ? `${value} (comprimido — valor completo, legibilidade limitada)`
      : value);

  return (
    <div
      ref={wrapRef}
      className={`min-w-0 w-full overflow-hidden flex justify-center ${className ?? ''}`}
      style={style}
      title={tip}
      data-autofit-cramped={cramped ? 'true' : 'false'}
      data-autofit-scale={scaleX.toFixed(3)}
    >
      <div
        ref={textRef}
        className="tabular-nums leading-none whitespace-nowrap text-center"
        style={{
          color,
          fontWeight,
          fontSize,
          // Hide until first layout measure to avoid a large-font flash
          opacity: ready ? 1 : 0,
          transform: scaleX < 0.999 ? `scaleX(${scaleX})` : undefined,
          transformOrigin: 'center center',
        }}
      >
        {value}
      </div>
    </div>
  );
}
