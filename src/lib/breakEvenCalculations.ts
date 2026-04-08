/**
 * Break Even (BE) Calculations for Bonus Hunt Tracker
 *
 * BE = the average multiplier every bonus needs to hit to break even (static, based on all bonuses)
 * Live BE = the average multiplier the remaining unopened bonuses still need to hit to break even
 */

export interface BonusHuntItem {
  bet_amount: number;
  payment_amount: number | null;
  status: 'pending' | 'opened';
}

/**
 * Calculate the initial Break Even multiplier
 * BE = target / totalBetAll
 * Where target = max(startMoney - stopLoss, 0)
 * And totalBetAll = sum of betSize for ALL bonuses (opened + unopened)
 *
 * @param startMoney - total money spent buying bonuses
 * @param totalBetAll - sum of bet_amount for all bonuses
 * @param stopLoss - optional loss threshold (default 0)
 * @returns BE multiplier, rounded to 1 decimal place
 */
export function calculateBE(startMoney: number, totalBetAll: number, stopLoss: number = 0): number {
  const target = Math.max(startMoney - stopLoss, 0);
  return totalBetAll > 0 ? target / totalBetAll : 0;
}

/**
 * Calculate the Live Break Even multiplier (Actual BE)
 * This updates dynamically as bonuses are opened
 *
 * Formulas:
 * - target = Math.max(startMoney - stopLoss, 0)
 * - totalWin = sum of payment_amount for opened bonuses only
 * - totalBetRemaining = sum of bet_amount for unopened bonuses only
 * - remaining = Math.max(target - totalWin, 0)
 * - liveBE = totalBetRemaining > 0 ? remaining / totalBetRemaining : 0
 *
 * @param items - array of BonusHuntItems
 * @param startMoney - total money spent buying bonuses
 * @param stopLoss - optional loss threshold (default 0)
 * @returns Live BE multiplier, rounded to 1 decimal place
 */
export function calculateLiveBE(items: BonusHuntItem[], startMoney: number, stopLoss: number = 0): number {
  const target = Math.max(startMoney - stopLoss, 0);

  // A bonus is considered "opened" if it has a payment_amount value (regardless of status)
  // This handles the case where payment is entered during opening phase
  const totalWin = items
    .filter(item => item.payment_amount !== null && item.payment_amount !== undefined && item.payment_amount > 0)
    .reduce((sum, item) => sum + (item.payment_amount || 0), 0);

  // Live BE uses: remainingCount × costPerBonus (average cost per bonus)
  const totalCount = items.length;
  const totalBetAll = items.reduce((sum, item) => sum + item.bet_amount, 0);
  const costPerBonus = totalCount > 0 ? totalBetAll / totalCount : 0;
  const remainingCount = items.filter(item => !item.payment_amount || item.payment_amount <= 0).length;
  const totalBetRemaining = remainingCount * costPerBonus;

  const remaining = Math.max(target - totalWin, 0);

  if (totalBetRemaining > 0) {
    return remaining / totalBetRemaining;
  }

  // If there are no bonuses left but we are still below target,
  // keep showing the required multiplier based on one bonus-cost unit.
  if (remaining > 0 && costPerBonus > 0) {
    return remaining / costPerBonus;
  }

  return 0;
}

/**
 * Format a multiplier value as a string with 1 decimal place and 'x' suffix
 * @param multiplier - the multiplier value
 * @returns formatted string (e.g. "25.0x", "15.5x")
 */
export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(1)}x`;
}

/**
 * Calculate total bet amount for all bonuses
 *
 * @param items - array of BonusHuntItems
 * @returns sum of all bet amounts
 */
export function calculateTotalBetAll(items: BonusHuntItem[]): number {
  return items.reduce((sum, item) => sum + item.bet_amount, 0);
}
