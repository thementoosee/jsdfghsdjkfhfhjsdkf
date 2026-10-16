import { TOURNAMENT_TOTAL_BUYS, type BonusTournamentBuy, type BonusTournamentDemo, type BonusTournamentMatch } from './types';

function sideBuys(
  m: BonusTournamentMatch,
  side: 'A' | 'B',
): { buyPrice: number | null; buys: BonusTournamentBuy[] } {
  return side === 'A'
    ? { buyPrice: m.buyPriceA, buys: m.buysA }
    : { buyPrice: m.buyPriceB, buys: m.buysB };
}

export interface TournamentHudStats {
  totalBuys: number;
  realizedCount: number;
  remainingBuys: number;
  /** Sum of unit BUY for every realized open. */
  gasto: number;
  /** Sum of registered PAYs only (pay !== null). */
  knownPay: number;
  /** knownPay − gasto. */
  profitLoss: number;
  /** True if any realized open still has pay === null. */
  provisional: boolean;
}

/** Aggregate tournament HUD counters from the full demo match list. */
export function calcTournamentHudStats(demo: BonusTournamentDemo): TournamentHudStats {
  let realizedCount = 0;
  let gasto = 0;
  let knownPay = 0;
  let provisional = false;

  for (const m of demo.matches) {
    for (const side of ['A', 'B'] as const) {
      const { buyPrice, buys } = sideBuys(m, side);
      for (const b of buys) {
        if (!b.realized) continue;
        realizedCount += 1;
        if (buyPrice != null && Number.isFinite(buyPrice) && buyPrice > 0) {
          gasto += buyPrice;
        }
        if (b.pay == null) {
          provisional = true;
        } else if (Number.isFinite(b.pay)) {
          knownPay += b.pay;
        }
      }
    }
  }

  return {
    totalBuys: TOURNAMENT_TOTAL_BUYS,
    realizedCount,
    remainingBuys: Math.max(0, TOURNAMENT_TOTAL_BUYS - realizedCount),
    gasto,
    knownPay,
    profitLoss: knownPay - gasto,
    provisional,
  };
}
