/*
  # Fix missing tables and columns

  1. Add missing columns to bonus_hunts and chill_sessions
    - `show_on_main_overlay` (boolean)
  
  2. Create bonus_openings table and related items table
*/

-- Add missing column to bonus_hunts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'show_on_main_overlay'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN show_on_main_overlay BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add missing column to chill_sessions if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chill_sessions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chill_sessions' AND column_name = 'show_on_main_overlay'
    ) THEN
      ALTER TABLE chill_sessions ADD COLUMN show_on_main_overlay BOOLEAN DEFAULT false;
    END IF;
  END IF;
END $$;

-- Create bonus_openings table if it doesn't exist
CREATE TABLE IF NOT EXISTS bonus_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  streamer_name TEXT,
  brand_logo_id UUID REFERENCES brand_logos(id),
  opening_number INTEGER,
  initial_break_even NUMERIC DEFAULT 0,
  show_on_main_overlay BOOLEAN DEFAULT false,
  source_hunt_id UUID REFERENCES bonus_hunts(id)
);

ALTER TABLE bonus_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bonus openings are readable by anyone"
  ON bonus_openings FOR SELECT
  USING (true);

CREATE POLICY "Bonus openings are writable by anyone"
  ON bonus_openings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Bonus openings are updatable by anyone"
  ON bonus_openings FOR UPDATE
  WITH CHECK (true);

CREATE POLICY "Bonus openings are deletable by anyone"
  ON bonus_openings FOR DELETE
  USING (true);

-- Create bonus_opening_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS bonus_opening_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_opening_id UUID NOT NULL REFERENCES bonus_openings(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES slots(id),
  slot_name TEXT,
  slot_image TEXT,
  current_break_even NUMERIC DEFAULT 0,
  current_break_even_multiplier NUMERIC DEFAULT 1,
  payment_amount NUMERIC DEFAULT 0,
  win_amount NUMERIC DEFAULT 0,
  is_super_bonus BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bonus_opening_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bonus opening items are readable by anyone"
  ON bonus_opening_items FOR SELECT
  USING (true);

CREATE POLICY "Bonus opening items are writable by anyone"
  ON bonus_opening_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Bonus opening items are updatable by anyone"
  ON bonus_opening_items FOR UPDATE
  WITH CHECK (true);

CREATE POLICY "Bonus opening items are deletable by anyone"
  ON bonus_opening_items FOR DELETE
  USING (true);
