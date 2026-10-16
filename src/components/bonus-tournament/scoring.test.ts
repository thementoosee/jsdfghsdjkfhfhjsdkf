import { describe, expect, it } from 'vitest';
import { createDemoTournament, playerMap } from './demo-data';
import { calcMulti, calcSideStats, isSameConfirmedPay, parsePayInput, suggestWinner } from './scoring';

describe('bonus-tournament scoring (BUY per match, slot fixed)', () => {
  it('calculates MULTI as PAY / BUY of the current round', () => {
    expect(calcMulti(100, 250)).toBeCloseTo(2.5);
    expect(calcMulti(200, 800)).toBeCloseTo(4);
    expect(calcMulti(0, 10)).toBeNull();
    expect(calcMulti(null, 10)).toBeNull();
  });

  const r = (pay: number | null) => ({ pay, realized: true as const });

  it('uses one BUY for all three opens; AVG needs 3 MULTIs', () => {
    const incomplete = calcSideStats(100, [r(250), r(800), r(null)]);
    expect(incomplete.avg).toBeNull();
    expect(incomplete.complete).toBe(false);
    expect(incomplete.buyPrice).toBe(100);
    expect(incomplete.totalPay).toBe(1050);

    const complete = calcSideStats(100, [r(250), r(800), r(450)]);
    expect(complete.totalPay).toBe(1500);
    expect(complete.avg).toBeCloseTo(5);
    expect(complete.complete).toBe(true);
  });

  it('exposes unit BUY (not sum of three prices)', () => {
    const stats = calcSideStats(50, [r(100), r(150), r(200)]);
    expect(stats.buyPrice).toBe(50);
    expect(stats.totalPay).toBe(450);
    expect(stats.avg).toBeCloseTo(3);
  });

  it('picks higher AVG as winner', () => {
    const winner = suggestWinner({
      playerAId: 'a',
      playerBId: 'b',
      buyPriceA: 1,
      buyPriceB: 1,
      buysA: [r(50), r(50), r(50)],
      buysB: [r(10), r(10), r(10)],
    });
    expect(winner).toBe('a');
  });

  it('uses PAY TOTAL as tie-break on equal AVG', () => {
    const winner = suggestWinner({
      playerAId: 'a',
      playerBId: 'b',
      buyPriceA: 1,
      buyPriceB: 2,
      buysA: [r(10), r(20), r(30)],
      buysB: [r(20), r(40), r(60)],
    });
    expect(winner).toBe('b');
  });

  it('returns null on exact double tie', () => {
    const winner = suggestWinner({
      playerAId: 'a',
      playerBId: 'b',
      buyPriceA: 1,
      buyPriceB: 1,
      buysA: [r(10), r(20), r(30)],
      buysB: [r(10), r(20), r(30)],
    });
    expect(winner).toBeNull();
  });
});

describe('bonus-tournament demo rules', () => {
  it('keeps the same slot for a player across rounds', () => {
    const demo = createDemoTournament('final');
    const players = playerMap(demo);
    const championId = demo.players[0].id;
    const slot = players[championId].slotName;

    const asA = demo.matches.filter((m) => m.playerAId === championId || m.playerBId === championId);
    expect(asA.length).toBeGreaterThan(1);
    expect(players[championId].slotName).toBe(slot);
  });

  it('allows different BUY prices per round for the same player (no carry-over)', () => {
    const demo = createDemoTournament('final');
    const p0 = demo.players[0].id;

    const qf = demo.matches.find((m) => m.id === 'qf-0')!;
    const sf = demo.matches.find((m) => m.id === 'sf-0')!;
    const fin = demo.matches.find((m) => m.id === 'final-0')!;

    expect(qf.playerAId).toBe(p0);
    expect(sf.playerAId).toBe(p0);
    expect(fin.playerAId).toBe(p0);

    expect(qf.buyPriceA).toBe(0.4);
    expect(fin.buyPriceA).toBe(1.5);
    // Next round starts empty until admin sets BUY for that match
    expect(sf.buyPriceA).toBeNull();
    expect(sf.buyPriceB).toBeNull();

    expect(qf.buyPriceA).not.toBe(fin.buyPriceA);
  });

  it('shares one BUY across the three pays of a side', () => {
    const demo = createDemoTournament('qf');
    const live = demo.matches.find((m) => m.id === 'qf-0')!;
    const statsA = calcSideStats(live.buyPriceA, live.buysA);
    expect(live.buyPriceA).toBe(0.4);
    expect(statsA.multis[0]).toBeCloseTo(15); // 6 / 0.4
    expect(statsA.multis[1]).toBeCloseTo(35); // 14 / 0.4
    expect(statsA.multis[2]).toBeNull();
    expect(statsA.buyPrice).toBe(0.4);
  });

  it('treats pay 0 as resolved (not pending) for MULTI', () => {
    expect(calcMulti(100, 0)).toBe(0);
    const stats = calcSideStats(100, [
      { pay: 0, realized: true },
      { pay: 200, realized: true },
      { pay: 300, realized: true },
    ]);
    expect(stats.multis[0]).toBe(0);
    expect(stats.complete).toBe(true);
    expect(stats.avg).toBeCloseTo((0 + 2 + 3) / 3);
  });
});

describe('bonus-tournament champion screen gate', () => {
  it('resolves champion only when completed + final winner confirmed', async () => {
    const { resolveTournamentChampion } = await import('./BonusTournamentOverlay');
    const live = createDemoTournament('final');
    expect(resolveTournamentChampion(live, playerMap(live))).toBeNull();

    const done = createDemoTournament('completed');
    const champ = resolveTournamentChampion(done, playerMap(done));
    expect(champ?.id).toBe(done.players[0].id);
    expect(champ?.displayName).toBeTruthy();
  });
});

describe('bonus-tournament HUD stats', () => {
  it('counts realized buys, gasto, and provisional P/L', async () => {
    const { calcTournamentHudStats } = await import('./tournament-stats');
    const { createDemoTournament } = await import('./demo-data');
    const demo = createDemoTournament('qf');
    const hud = calcTournamentHudStats(demo);

    // qf-1 done (6) + qf-0 live (A 3 + B 3 realized, some pay null) = 12
    expect(hud.realizedCount).toBe(12);
    expect(hud.remainingBuys).toBe(42 - 12);
    expect(hud.totalBuys).toBe(42);
    expect(hud.provisional).toBe(true); // live match has pending PAYs
    expect(hud.gasto).toBeGreaterThan(0);
    expect(hud.knownPay).toBeGreaterThan(0);
    expect(hud.profitLoss).toBeCloseTo(hud.knownPay - hud.gasto);
  });
});

describe('PAY draft confirm (ENTER) helpers', () => {
  it('parses empty as clear, rejects negatives/NaN', () => {
    expect(parsePayInput('')).toBeNull();
    expect(parsePayInput('  ')).toBeNull();
    expect(parsePayInput('100')).toBe(100);
    expect(parsePayInput('12.5')).toBe(12.5);
    expect(parsePayInput('-1')).toBeUndefined();
    expect(parsePayInput('abc')).toBeUndefined();
  });

  it('detects unchanged confirmed vs draft to avoid duplicate persist', () => {
    expect(isSameConfirmedPay(null, null)).toBe(true);
    expect(isSameConfirmedPay(100, 100)).toBe(true);
    expect(isSameConfirmedPay(100, 100.0)).toBe(true);
    expect(isSameConfirmedPay(null, 0)).toBe(false);
    expect(isSameConfirmedPay(100, null)).toBe(false);
  });
});
