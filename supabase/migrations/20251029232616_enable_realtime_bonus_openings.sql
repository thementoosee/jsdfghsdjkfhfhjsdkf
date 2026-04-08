/*
  # Enable Realtime for Bonus Openings
  
  1. Changes
    - Enable realtime replication for bonus_openings table
    - Enable realtime replication for bonus_opening_items table
*/

-- Enable realtime for bonus_openings
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_openings;

-- Enable realtime for bonus_opening_items
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_opening_items;