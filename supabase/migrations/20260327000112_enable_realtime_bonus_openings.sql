/*
  # Enable Realtime for Bonus Opening System

  1. Changes
    - Enable realtime replication for bonus_openings table
    - Enable realtime replication for bonus_opening_items table
    - This allows real-time updates in the overlay without page refresh
*/

ALTER PUBLICATION supabase_realtime ADD TABLE bonus_openings;
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_opening_items;
