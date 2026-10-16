import type { BonusTournamentEntry } from './types';
import {
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  type DrawMatchup,
  type DrawParticipant,
  type DrawResult,
} from './draw-types';

/** Unique by twitchUserId — first occurrence wins. */
export function uniqueEntriesByTwitchId(entries: BonusTournamentEntry[]): BonusTournamentEntry[] {
  const seen = new Set<string>();
  const out: BonusTournamentEntry[] = [];
  for (const e of entries) {
    const id = e.twitchUserId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

function toParticipant(e: BonusTournamentEntry): DrawParticipant {
  return {
    twitchUserId: e.twitchUserId,
    displayName: e.displayName,
    avatarUrl: e.avatarUrl,
  };
}

/** Cryptographically secure Fisher–Yates (browser / Node via crypto). */
export function secureShuffle<T>(items: T[], randomBytes: (n: number) => Uint32Array): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const buf = randomBytes(1);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function defaultRandomBytes(n: number): Uint32Array {
  const out = new Uint32Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out);
    return out;
  }
  throw new Error('Secure random unavailable');
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function pairSelectedIntoMatchups(selected: DrawParticipant[]): DrawMatchup[] {
  if (selected.length !== DRAW_SLOT_COUNT) {
    throw new Error(`Expected ${DRAW_SLOT_COUNT} players, got ${selected.length}`);
  }
  const matchups: DrawMatchup[] = [];
  for (let i = 0; i < DRAW_MATCH_COUNT; i += 1) {
    matchups.push({
      index: i,
      playerA: selected[i * 2],
      playerB: selected[i * 2 + 1],
    });
  }
  return matchups;
}

export function validateDrawResult(result: DrawResult): { ok: true } | { ok: false; reason: string } {
  if (result.selected.length !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: `selected length ${result.selected.length}` };
  }
  const ids = result.selected.map((p) => p.twitchUserId);
  if (new Set(ids).size !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: 'duplicate twitchUserId in selected' };
  }
  if (result.matchups.length !== DRAW_MATCH_COUNT) {
    return { ok: false, reason: `matchups length ${result.matchups.length}` };
  }
  const seen = new Set<string>();
  for (const m of result.matchups) {
    for (const p of [m.playerA, m.playerB]) {
      if (seen.has(p.twitchUserId)) return { ok: false, reason: 'player in multiple matchups' };
      seen.add(p.twitchUserId);
    }
  }
  if (seen.size !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: 'matchup players do not cover all selected' };
  }
  return { ok: true };
}

/**
 * Select exactly 8 unique participants without replacement and build 4 QF matchups.
 * Animation must never call this — result is fixed before presentation.
 */
export async function generateDrawResult(
  entries: BonusTournamentEntry[],
  randomBytes: (n: number) => Uint32Array = defaultRandomBytes,
): Promise<DrawResult> {
  const unique = uniqueEntriesByTwitchId(entries);
  if (unique.length < DRAW_SLOT_COUNT) {
    throw new Error(`Need at least ${DRAW_SLOT_COUNT} unique entries, got ${unique.length}`);
  }

  const shuffled = secureShuffle(unique, randomBytes);
  const selected = shuffled.slice(0, DRAW_SLOT_COUNT).map(toParticipant);
  // Second shuffle of the selected 8 defines bracket order / pairing
  const ordered = secureShuffle(selected, randomBytes);
  const matchups = pairSelectedIntoMatchups(ordered);
  const generatedAt = new Date().toISOString();
  const canonical = JSON.stringify({
    selected: ordered.map((p) => p.twitchUserId),
    matchups: matchups.map((m) => [m.playerA.twitchUserId, m.playerB.twitchUserId]),
    generatedAt,
  });
  const resultHash = await sha256Hex(canonical);

  const result: DrawResult = {
    selected: ordered,
    matchups,
    generatedAt,
    resultHash,
  };
  const check = validateDrawResult(result);
  if (!check.ok) throw new Error(`Invalid draw: ${check.reason}`);
  return result;
}
