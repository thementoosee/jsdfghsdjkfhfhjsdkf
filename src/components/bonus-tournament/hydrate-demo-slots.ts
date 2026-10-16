import { resolveSlotImageUrl } from '../../lib/slot-image';
import { searchSlotsCatalog } from '../../lib/slots-search';
import type { BonusTournamentDemo, BonusTournamentPlayer } from './types';

/**
 * Attach real catalog slot names/images to demo players via existing search_slots RPC.
 * Falls back to whatever the player already has if a name isn't found.
 * Entries (enrollment) are left untouched — they have no slots.
 */
export async function hydrateDemoSlotsFromCatalog(
  demo: BonusTournamentDemo,
): Promise<BonusTournamentDemo> {
  const uniqueNames = Array.from(
    new Set(demo.players.map((p) => p.slotName.trim()).filter((n) => n.length >= 2)),
  );

  const resolved = new Map<string, { name: string; image: string }>();

  await Promise.all(
    uniqueNames.map(async (name) => {
      try {
        const hits = await searchSlotsCatalog(name, 5);
        const exact =
          hits.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? hits[0];
        if (!exact) return;
        resolved.set(name, {
          name: exact.name,
          image: resolveSlotImageUrl(exact),
        });
      } catch (err) {
        console.warn('[bonus-tournament] catalog hydrate failed for', name, err);
      }
    }),
  );

  const patch = (p: BonusTournamentPlayer): BonusTournamentPlayer => {
    const hit = resolved.get(p.slotName.trim());
    if (!hit) return p;
    return { ...p, slotName: hit.name, slotImage: hit.image };
  };

  return {
    ...demo,
    players: demo.players.map(patch),
  };
}
