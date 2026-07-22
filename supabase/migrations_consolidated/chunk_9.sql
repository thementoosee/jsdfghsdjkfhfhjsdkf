-- 9. TOP SLOTS STATISTICS
--    Source: 20260402000610 + 20260402000646 (realtime) + 20260402000818 (seed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS top_slots_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image text,
  total_bonuses integer DEFAULT 0,
  total_bet numeric DEFAULT 0,
  total_won numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  average_multiplier numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE top_slots_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public read access to top_slots_stats" ON top_slots_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public insert access to top_slots_stats" ON top_slots_stats FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public update access to top_slots_stats" ON top_slots_stats FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public delete access to top_slots_stats" ON top_slots_stats FOR DELETE USING (true);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='top_slots_stats') THEN ALTER PUBLICATION supabase_realtime ADD TABLE top_slots_stats; END IF; END $$;

-- Seed default rows (only if table empty).
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

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
