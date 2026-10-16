import type { CSSProperties } from 'react';
import { SLOT_FALLBACK_IMAGE } from '../../lib/slot-image';

/** Same fallback behaviour as Hunt/Opening thumbnails — local module only. */
export function SlotThumb({
  src,
  alt,
  className = '',
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={src || SLOT_FALLBACK_IMAGE}
      alt={alt}
      className={className}
      style={style}
      onError={(e) => {
        if (e.currentTarget.dataset.fallbackApplied === '1') return;
        e.currentTarget.dataset.fallbackApplied = '1';
        e.currentTarget.src = SLOT_FALLBACK_IMAGE;
      }}
    />
  );
}
