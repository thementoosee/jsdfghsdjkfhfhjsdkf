/*
  # Seed Default Top Slots Statistics

  1. Changes
    - Adds 5 sample slots to top_slots_stats for initial display
    - Only inserts if the table is empty
  
  2. Notes
    - These are placeholder values that will be replaced with real data
    - Uses popular slot names and default image
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM top_slots_stats LIMIT 1) THEN
    INSERT INTO top_slots_stats (slot_name, slot_image, total_bonuses, total_bet, total_won, profit, average_multiplier) VALUES
    ('Gates of Olympus', '/wVqLzwT_default.png', 25, 500.00, 1250.00, 750.00, 2.50),
    ('Sweet Bonanza', '/wVqLzwT_default.png', 30, 600.00, 1350.00, 750.00, 2.25),
    ('The Dog House', '/wVqLzwT_default.png', 20, 400.00, 920.00, 520.00, 2.30),
    ('Sugar Rush', '/wVqLzwT_default.png', 15, 300.00, 660.00, 360.00, 2.20),
    ('Starlight Princess', '/wVqLzwT_default.png', 18, 360.00, 720.00, 360.00, 2.00);
  END IF;
END $$;