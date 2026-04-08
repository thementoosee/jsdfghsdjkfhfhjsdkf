/*
  # Recreate Giveaway System

  1. New Tables
    - `giveaways` - Main giveaway table
    - `giveaway_participants` - Participants in giveaways

  2. Security
    - Enable RLS on all tables
    - Add policies for public read access (for overlays)
    - Add policies for authenticated write access (for dashboard)

  3. Functions & Triggers
    - Auto-update total_participants count
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS giveaway_participants CASCADE;
DROP TABLE IF EXISTS giveaways CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_giveaway_participants_count() CASCADE;

-- Create giveaways table
CREATE TABLE giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drawing', 'completed')),
  winner_username text,
  total_participants integer DEFAULT 0,
  is_visible boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create giveaway_participants table
CREATE TABLE giveaway_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  username text NOT NULL,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(giveaway_id, user_id)
);

-- Enable RLS
ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_participants ENABLE ROW LEVEL SECURITY;

-- Policies for giveaways (public read, authenticated write)
CREATE POLICY "Anyone can view giveaways"
  ON giveaways FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert giveaways"
  ON giveaways FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update giveaways"
  ON giveaways FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete giveaways"
  ON giveaways FOR DELETE
  TO authenticated
  USING (true);

-- Policies for giveaway_participants (public read and insert)
CREATE POLICY "Anyone can view participants"
  ON giveaway_participants FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert participants"
  ON giveaway_participants FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete participants"
  ON giveaway_participants FOR DELETE
  TO authenticated
  USING (true);

-- Function to update total_participants
CREATE OR REPLACE FUNCTION update_giveaway_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE giveaways
    SET total_participants = (
      SELECT COUNT(*)
      FROM giveaway_participants
      WHERE giveaway_id = NEW.giveaway_id
    )
    WHERE id = NEW.giveaway_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE giveaways
    SET total_participants = (
      SELECT COUNT(*)
      FROM giveaway_participants
      WHERE giveaway_id = OLD.giveaway_id
    )
    WHERE id = OLD.giveaway_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update participants count
CREATE TRIGGER giveaway_participants_count_trigger
AFTER INSERT OR DELETE ON giveaway_participants
FOR EACH ROW
EXECUTE FUNCTION update_giveaway_participants_count();

-- Enable realtime
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'giveaways'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE giveaways;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'giveaway_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE giveaway_participants;
  END IF;
END $$;
