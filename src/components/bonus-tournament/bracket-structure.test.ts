import { describe, expect, it } from 'vitest';
import {
  BRACKET_OVERLAY_H,
  BRACKET_OVERLAY_W,
  BRACKET_PLAYER_COUNT,
  BRACKET_QF_COUNT,
  buildBracketTreeFromDraw,
  buildBracketViewFromDemo,
  buildDemoBracketView,
  parseBracketDemoStage,
} from './bracket-structure';
import { createDemoTournament } from './demo-data';
import { DRAW_MATCH_COUNT, DRAW_SLOT_COUNT } from './draw-types';
import { getMainOverlayCasinoCutout } from '../../lib/overlay-layout';

describe('bracket-structure', () => {
  it('matches 8-player draw constants and casino cutout size', () => {
    expect(BRACKET_PLAYER_COUNT).toBe(8);
    expect(BRACKET_QF_COUNT).toBe(4);
    expect(DRAW_SLOT_COUNT).toBe(8);
    expect(DRAW_MATCH_COUNT).toBe(4);
    const cutout = getMainOverlayCasinoCutout(true);
    expect(BRACKET_OVERLAY_W).toBe(cutout.width);
    expect(BRACKET_OVERLAY_H).toBe(cutout.height);
    expect(cutout.width).toBe(1288);
    expect(cutout.height).toBe(720);
  });

  it('builds DEMO QF with 8 players and empty later rounds', () => {
    const view = buildDemoBracketView('qf');
    expect(view.quarterfinals).toHaveLength(4);
    for (const m of view.quarterfinals) {
      expect(m.playerA.participant).toBeTruthy();
      expect(m.playerB.participant).toBeTruthy();
      expect(m.winnerId).toBeNull();
    }
    expect(view.semifinals[0].playerA.participant).toBeNull();
    expect(view.semifinals[1].playerB.participant).toBeNull();
    expect(view.final.playerA.participant).toBeNull();
    expect(view.champion).toBeNull();
  });

  it('advances winners correctly after QF / SF / champion', () => {
    const afterQf = buildDemoBracketView('after_qf');
    expect(afterQf.quarterfinals.every((m) => m.winnerId)).toBe(true);
    expect(afterQf.semifinals[0].playerA.participant?.twitchUserId).toBe(
      afterQf.quarterfinals[0].winnerId,
    );
    expect(afterQf.semifinals[0].playerB.participant?.twitchUserId).toBe(
      afterQf.quarterfinals[1].winnerId,
    );
    expect(afterQf.semifinals[1].playerA.participant?.twitchUserId).toBe(
      afterQf.quarterfinals[2].winnerId,
    );
    expect(afterQf.final.playerA.participant).toBeNull();

    const afterSf = buildDemoBracketView('after_sf');
    expect(afterSf.semifinals.every((m) => m.winnerId)).toBe(true);
    expect(afterSf.final.playerA.participant?.twitchUserId).toBe(afterSf.semifinals[0].winnerId);
    expect(afterSf.final.playerB.participant?.twitchUserId).toBe(afterSf.semifinals[1].winnerId);
    expect(afterSf.final.winnerId).toBeNull();
    expect(afterSf.champion).toBeNull();

    const champ = buildDemoBracketView('champion');
    expect(champ.champion?.twitchUserId).toBe(champ.final.winnerId);
    expect(champ.champion?.twitchUserId).toBe(champ.semifinals[0].winnerId);
  });

  it('keeps slot attached to the same player across rounds', () => {
    const view = buildDemoBracketView('champion');
    const champId = view.champion!.twitchUserId;
    const qfSeat = view.quarterfinals
      .flatMap((m) => [m.playerA, m.playerB])
      .find((s) => s.participant?.twitchUserId === champId);
    expect(qfSeat?.participant?.slot?.slotName).toBe(view.champion!.slot?.slotName);
  });

  it('projects confirmed winners from demo tournament without inventing results', () => {
    const demo = createDemoTournament('sf');
    const view = buildBracketViewFromDemo(demo, 'live');
    const doneQf = view.quarterfinals.filter((m) => m.winnerId);
    expect(doneQf.length).toBe(4);
    expect(view.semifinals[0].playerA.participant).toBeTruthy();
    expect(view.champion).toBeNull();
  });

  it('buildBracketTreeFromDraw preserves pairing order', () => {
    const selected = buildDemoBracketView('qf').quarterfinals.flatMap((m) => [
      m.playerA.participant!,
      m.playerB.participant!,
    ]);
    const matchups = [
      { index: 0, playerA: selected[0]!, playerB: selected[1]! },
      { index: 1, playerA: selected[2]!, playerB: selected[3]! },
      { index: 2, playerA: selected[4]!, playerB: selected[5]! },
      { index: 3, playerA: selected[6]!, playerB: selected[7]! },
    ];
    const tree = buildBracketTreeFromDraw(selected, matchups);
    expect(tree.quarterfinals[2].playerA.participant?.twitchUserId).toBe(selected[4]!.twitchUserId);
    expect(tree.semifinals[0].playerA.participant).toBeNull();
  });

  it('parses stage query values', () => {
    expect(parseBracketDemoStage('qf')).toBe('qf');
    expect(parseBracketDemoStage('after_qf')).toBe('after_qf');
    expect(parseBracketDemoStage('after-sf')).toBe('after_sf');
    expect(parseBracketDemoStage('champion')).toBe('champion');
    expect(parseBracketDemoStage(null)).toBe('qf');
  });
});
