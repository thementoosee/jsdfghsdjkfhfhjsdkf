/*
  # Enable Realtime for Fever Champions League Tables

  1. Changes
    - Enable realtime replication for all fever champions tables
    - This allows the overlays and manager to update in real-time
*/

-- Enable realtime for fever_tournaments
ALTER PUBLICATION supabase_realtime ADD TABLE fever_tournaments;

-- Enable realtime for fever_groups
ALTER PUBLICATION supabase_realtime ADD TABLE fever_groups;

-- Enable realtime for fever_participants
ALTER PUBLICATION supabase_realtime ADD TABLE fever_participants;

-- Enable realtime for fever_spins
ALTER PUBLICATION supabase_realtime ADD TABLE fever_spins;

-- Enable realtime for fever_matches
ALTER PUBLICATION supabase_realtime ADD TABLE fever_matches;

-- Enable realtime for fever_playoff_matches
ALTER PUBLICATION supabase_realtime ADD TABLE fever_playoff_matches;
