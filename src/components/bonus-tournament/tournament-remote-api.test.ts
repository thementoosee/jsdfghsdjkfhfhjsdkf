import { describe, expect, it } from 'vitest';
import { createDemoTournament } from './demo-data';
import { rowToTournament, tournamentToPayload } from './tournament-remote-api';
import type { RemoteTournamentRow } from './tournament-remote-api';

describe('tournament-remote-api mappers', () => {
  it('rowToTournament maps REAL row with empty entries by default', () => {
    const row: RemoteTournamentRow = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'HUNT DOS REIS',
      chat_command: '!torneio',
      prize_pool: 250,
      status: 'entries',
      is_active: false,
      is_demo: false,
      entries_open: true,
      entries_config: {},
      players: [],
      matches: [],
      selected_match_id: null,
      overlay_view: 'entries',
      state_version: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const t = rowToTournament(row);
    expect(t.isDemo).toBe(false);
    expect(t.entries).toHaveLength(0);
    expect(t.entriesConfig.chatCommand).toBe('!torneio');
    expect(t.entriesConfig.entriesOpen).toBe(true);
  });

  it('tournamentToPayload round-trips core fields', () => {
    const demo = { ...createDemoTournament('qf'), isDemo: false };
    const payload = tournamentToPayload(demo);
    expect(payload.status).toBe('qf');
    expect(Array.isArray(payload.players)).toBe(true);
    expect(Array.isArray(payload.matches)).toBe(true);
    expect(payload.chat_command).toBe(demo.entriesConfig.chatCommand);
  });
});
