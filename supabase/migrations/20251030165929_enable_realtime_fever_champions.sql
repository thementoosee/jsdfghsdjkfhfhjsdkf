/*
  # Enable Realtime for Fever Champions League Tables

  This migration enables realtime subscriptions for all Fever Champions League tables
  so that the overlay can receive live updates when data changes.

  ## Changes
  - Enable REPLICA IDENTITY FULL for fever_tournaments
  - Enable REPLICA IDENTITY FULL for fever_groups
  - Enable REPLICA IDENTITY FULL for fever_participants
  - Enable REPLICA IDENTITY FULL for fever_spins

  ## Security
  - No changes to RLS policies (already configured for public read access)
*/

-- Enable realtime for fever_tournaments
ALTER TABLE fever_tournaments REPLICA IDENTITY FULL;

-- Enable realtime for fever_groups
ALTER TABLE fever_groups REPLICA IDENTITY FULL;

-- Enable realtime for fever_participants
ALTER TABLE fever_participants REPLICA IDENTITY FULL;

-- Enable realtime for fever_spins
ALTER TABLE fever_spins REPLICA IDENTITY FULL;
