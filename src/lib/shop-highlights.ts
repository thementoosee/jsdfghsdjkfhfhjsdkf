/** Shop Jigadores highlights — public API helpers (no Supabase). */

export const SHOP_HIGHLIGHTS_ENV_KEY = 'VITE_JIGADORES_SHOP_HIGHLIGHTS_URL';

export type ShopHighlight = {
  id: string;
  name: string;
  image: string | null;
  pointsCost: number;
  position: number;
  backgroundPreset: string | null;
  backgroundPrimaryColor: string | null;
  backgroundSecondaryColor: string | null;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  imageGlow: boolean;
  imageShadow: boolean;
};

export type ShopHighlightsResponse = {
  items: ShopHighlight[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

/** Format JP with dot thousands separators (e.g. 260000 → "260.000 JP"). */
export function formatJigadoresPoints(pointsCost: number): string {
  if (!Number.isFinite(pointsCost)) return '0 JP';
  const rounded = Math.max(0, Math.round(pointsCost));
  const formatted = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} JP`;
}

export function getShopHighlightsUrl(): string | null {
  try {
    const raw = import.meta.env[SHOP_HIGHLIGHTS_ENV_KEY] as string | undefined;
    const trimmed = (raw ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function normalizeShopHighlight(raw: unknown): ShopHighlight | null {
  const row = asRecord(raw);
  if (!row) return null;

  const id = asString(row.id);
  const name = asString(row.name);
  const pointsCost = asFiniteNumber(row.pointsCost);
  const position = asFiniteNumber(row.position);

  if (!id || !name || pointsCost === null || pointsCost < 0 || position === null) {
    return null;
  }

  const image = asString(row.image);
  const imageScale = asFiniteNumber(row.imageScale);
  const imageOffsetX = asFiniteNumber(row.imageOffsetX);
  const imageOffsetY = asFiniteNumber(row.imageOffsetY);

  return {
    id,
    name,
    image,
    pointsCost,
    position: Math.round(position),
    backgroundPreset: asString(row.backgroundPreset),
    backgroundPrimaryColor: asString(row.backgroundPrimaryColor),
    backgroundSecondaryColor: asString(row.backgroundSecondaryColor),
    imageScale: imageScale === null ? 1 : imageScale,
    imageOffsetX: imageOffsetX === null ? 0 : imageOffsetX,
    imageOffsetY: imageOffsetY === null ? 0 : imageOffsetY,
    imageGlow: asBoolean(row.imageGlow, true),
    imageShadow: asBoolean(row.imageShadow, true),
  };
}

/**
 * Accepts API payload `{ items: [...] }` or a bare array.
 * Sorts by position ascending and keeps at most 3 valid products.
 */
export function normalizeShopHighlights(payload: unknown): ShopHighlight[] {
  let list: unknown[] = [];

  if (Array.isArray(payload)) {
    list = payload;
  } else {
    const root = asRecord(payload);
    if (root && Array.isArray(root.items)) {
      list = root.items;
    }
  }

  const normalized = list
    .map(normalizeShopHighlight)
    .filter((item): item is ShopHighlight => item !== null)
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name, 'pt');
    });

  return normalized.slice(0, 3);
}

/** Keep current index valid when the list shrinks/grows mid-rotation. */
export function clampShopHighlightIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index) || index < 0) return 0;
  return index % length;
}

/**
 * Pure cycle step while the drawer is open.
 * - next → stay open and show the following product
 * - retract → close drawer after the last product
 */
export type ShopProductAdvance =
  | { type: 'next'; nextIndex: number; drawerStaysOpen: true }
  | { type: 'retract'; drawerStaysOpen: false };

export function resolveShopProductAdvance(
  currentIndex: number,
  length: number,
): ShopProductAdvance {
  if (length <= 0 || currentIndex >= length - 1) {
    return { type: 'retract', drawerStaysOpen: false };
  }
  return {
    type: 'next',
    nextIndex: currentIndex + 1,
    drawerStaysOpen: true,
  };
}

/** Walk a full open-session sequence for tests (indices shown, then retract). */
export function planShopOpenSession(length: number): number[] {
  if (length <= 0) return [];
  return Array.from({ length }, (_, i) => i);
}

export function resolveShopCardBackground(item: ShopHighlight): string {
  const primary = item.backgroundPrimaryColor;
  const secondary = item.backgroundSecondaryColor;
  if (primary && secondary) {
    return `linear-gradient(145deg, ${primary} 0%, ${secondary} 100%)`;
  }
  if (primary) {
    return primary;
  }

  switch (item.backgroundPreset) {
    case 'stadium-light':
      return 'linear-gradient(145deg, #1e293b 0%, #0f172a 55%, #1e3a5f 100%)';
    case 'neon-cyan':
      return 'linear-gradient(145deg, #0b1220 0%, #0e7490 100%)';
    case 'midnight':
      return 'linear-gradient(145deg, #020617 0%, #111827 100%)';
    default:
      return 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
  }
}

export async function fetchShopHighlights(
  url: string,
  signal?: AbortSignal,
): Promise<ShopHighlight[]> {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('_ts', String(Date.now()));

  // Simple CORS GET — no custom headers (avoids preflight).
  const response = await fetch(requestUrl.toString(), {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    throw new Error(`shop_highlights_http_${response.status}`);
  }

  const json = await response.json();
  return normalizeShopHighlights(json);
}
