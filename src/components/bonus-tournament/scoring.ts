import type { BonusTournamentBuy } from './types';

/**
 * Parse a PAY input draft. Empty → null (clear). Invalid → undefined (reject).
 * Does not mutate shared/overlay state — call only on ENTER confirm.
 */
export function parsePayInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

/** True when draft equals already-confirmed pay (skip duplicate persist / animation). */
export function isSameConfirmedPay(confirmed: number | null, draft: number | null): boolean {
  if (confirmed == null && draft == null) return true;
  if (confirmed == null || draft == null) return false;
  return confirmed === draft;
}

/** MULTI = PAY / BUY (single shared buy price for the side). */
export function calcMulti(buyPrice: number | null, pay: number | null): number | null {
  if (buyPrice == null || pay == null) return null;
  if (!(buyPrice > 0) || !Number.isFinite(buyPrice) || !Number.isFinite(pay)) return null;
  return pay / buyPrice;
}

/**
 * Side stats for one player in a match.
 * BUY = the single buy price (not sum).
 * PAY TOTAL = sum of 3 PAYs.
 * AVG = mean of 3 MULTIs when all three are defined.
 */
export function calcSideStats(buyPrice: number | null, buys: BonusTournamentBuy[]) {
  const multis = buys.map((b) => calcMulti(buyPrice, b.pay));
  const pays = buys.map((b) => b.pay).filter((v): v is number => v != null && Number.isFinite(v));
  const totalPay = pays.reduce((s, v) => s + v, 0);

  const definedMultis = multis.filter((m): m is number => m != null);
  const avg =
    definedMultis.length === buys.length && buys.length > 0
      ? definedMultis.reduce((s, v) => s + v, 0) / definedMultis.length
      : null;

  return {
    multis,
    buyPrice: buyPrice != null && Number.isFinite(buyPrice) ? buyPrice : null,
    totalPay,
    avg,
    complete: avg != null,
  };
}

/**
 * Winner by highest AVG; tie-break highest total PAY.
 * Exact double tie → null (do not auto-select).
 */
export function suggestWinner(args: {
  playerAId: string;
  playerBId: string;
  buyPriceA: number | null;
  buyPriceB: number | null;
  buysA: BonusTournamentBuy[];
  buysB: BonusTournamentBuy[];
}): string | null {
  const a = calcSideStats(args.buyPriceA, args.buysA);
  const b = calcSideStats(args.buyPriceB, args.buysB);
  if (!a.complete || !b.complete || a.avg == null || b.avg == null) return null;

  if (a.avg > b.avg) return args.playerAId;
  if (b.avg > a.avg) return args.playerBId;
  if (a.totalPay > b.totalPay) return args.playerAId;
  if (b.totalPay > a.totalPay) return args.playerBId;
  return null;
}

export function formatMulti(m: number | null): string {
  if (m == null) return '—';
  return `${m.toFixed(2)}x`;
}

export function formatMoney(v: number | null): string {
  if (v == null) return '—';
  return `€${v.toFixed(2)}`;
}

export function formatAvg(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}x`;
}
