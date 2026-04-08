/*
  # Enable Realtime for Playoffs

  1. Changes
    - Enable realtime replication for fever_playoff_matches table
*/

ALTER PUBLICATION supabase_realtime ADD TABLE fever_playoff_matches;
