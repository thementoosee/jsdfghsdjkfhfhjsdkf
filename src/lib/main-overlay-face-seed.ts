/**
 * Short-lived seeds so main-stream SLIDE faces remount with data already ready.
 * MainStreamOverlay warms the destination while the sidebar is fully hidden; overlays consume on mount.
 */

type SeedRecord = Record<string, unknown>;

const chillById = new Map<string, SeedRecord>();
const huntById = new Map<string, SeedRecord>();
const huntItemsById = new Map<string, SeedRecord[]>();

export function seedChillOverlayFace(id: string, data: SeedRecord): void {
  chillById.set(id, data);
}

export function takeChillOverlayFace<T extends SeedRecord>(id: string): T | null {
  const data = chillById.get(id) ?? null;
  if (data) chillById.delete(id);
  return data as T | null;
}

export function seedHuntOverlayFace(id: string, hunt: SeedRecord, items: SeedRecord[] = []): void {
  huntById.set(id, hunt);
  huntItemsById.set(id, items);
}

export function takeHuntOverlayFace<THunt extends SeedRecord, TItem extends SeedRecord>(
  id: string,
): { hunt: THunt; items: TItem[] } | null {
  const hunt = huntById.get(id);
  if (!hunt) return null;
  const items = (huntItemsById.get(id) ?? []) as TItem[];
  huntById.delete(id);
  huntItemsById.delete(id);
  return { hunt: hunt as THunt, items };
}

export function clearMainOverlayFaceSeeds(): void {
  chillById.clear();
  huntById.clear();
  huntItemsById.clear();
}
