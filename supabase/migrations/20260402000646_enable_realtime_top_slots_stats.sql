/*
  # Enable Realtime for Top Slots Stats

  1. Changes
    - Enable realtime replication for top_slots_stats table
  
  2. Notes
    - Allows real-time updates to be broadcast to connected clients
*/

ALTER PUBLICATION supabase_realtime ADD TABLE top_slots_stats;