/**
 * Single resolver for slot images.
 * Priority: Storage public URL → external image_url → local fallback.
 *
 * Do not put service-role keys here. Frontend uses only the public anon URL base.
 */

export const SLOT_FALLBACK_IMAGE = '/slot-fallback.svg';
export const SLOT_IMAGES_BUCKET = 'slot-images';

export type SlotImageFields = {
  image_storage_path?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function isHttpOrAbsolutePath(value: string): boolean {
  return (
    value.startsWith('https://') ||
    value.startsWith('http://') ||
    value.startsWith('/')
  );
}

function defaultSupabaseUrl(): string | undefined {
  try {
    return import.meta.env.VITE_SUPABASE_URL as string | undefined;
  } catch {
    return undefined;
  }
}

/** Build a stable public Storage URL for a path inside the slot-images bucket. */
export function publicSlotImageUrl(
  storagePath: string,
  supabaseUrl = defaultSupabaseUrl()
): string {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  const objectPath = storagePath.replace(/^\/+/, '');
  if (!base) {
    return `/${SLOT_IMAGES_BUCKET}/${objectPath}`;
  }
  return `${base}/storage/v1/object/public/${SLOT_IMAGES_BUCKET}/${objectPath}`;
}

/**
 * Resolve the best display URL for a catalog slot.
 * thumbnail_url is ignored in this phase (single WebP via image_storage_path).
 */
export function resolveSlotImageUrl(
  slot: SlotImageFields,
  options?: { supabaseUrl?: string }
): string {
  const storagePath = trimOrEmpty(slot.image_storage_path);
  if (storagePath) {
    return publicSlotImageUrl(storagePath, options?.supabaseUrl);
  }

  const external = trimOrEmpty(slot.image_url);
  if (external && isHttpOrAbsolutePath(external)) {
    return external;
  }

  return SLOT_FALLBACK_IMAGE;
}

/**
 * For historical hunt/opening/fever rows:
 * current slot asset → snapshot URL → fallback.
 * Does not mutate stored snapshots.
 */
export function resolveHistoricalSlotImage(options: {
  slot?: SlotImageFields | null;
  snapshotUrl?: string | null;
  supabaseUrl?: string;
}): string {
  if (options.slot) {
    const storagePath = trimOrEmpty(options.slot.image_storage_path);
    if (storagePath) {
      return publicSlotImageUrl(storagePath, options.supabaseUrl);
    }
    const external = trimOrEmpty(options.slot.image_url);
    if (external && isHttpOrAbsolutePath(external)) {
      return external;
    }
  }

  const snapshot = trimOrEmpty(options.snapshotUrl);
  if (snapshot && isHttpOrAbsolutePath(snapshot)) {
    return snapshot;
  }

  return SLOT_FALLBACK_IMAGE;
}
