/*
  # Create Fever Champions League System

  ## Overview
  Recreation of a Champions League tournament for slot streaming with 4 groups of 4 viewers each.
  Each viewer selects a slot and earns points based on multiplier ranges.

  ## New Tables

  ### `fever_tournaments`
  Tournament container for each Fever Champions League edition
  - `id` (uuid, primary key)
  - `name` (text) - Tournament name/edition
  - `status` (text) - 'setup', 'active', 'completed'
  - `current_phase` (text) - 'group_stage', 'knockout'
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `fever_groups`
  Groups within a tournament (A, B, C, D)
  - `id` (uuid, primary key)
  - `tournament_id` (uuid, foreign key)
  - `group_name` (text) - 'A', 'B', 'C', 'D'
  - `created_at` (timestamptz)

  ### `fever_participants`
  Viewers participating in the tournament
  - `id` (uuid, primary key)
  - `tournament_id` (uuid, foreign key)
  - `group_id` (uuid, foreign key)
  - `viewer_name` (text) - Viewer's name
  - `slot_name` (text) - Selected slot
  - `slot_image` (text) - Slot image URL
  - `points` (integer) - Total points accumulated
  - `spins_count` (integer) - Number of spins made
  - `position` (integer) - Position in group
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `fever_spins`
  Individual spin results for tracking
  - `id` (uuid, primary key)
  - `participant_id` (uuid, foreign key)
  - `tournament_id` (uuid, foreign key)
  - `multiplier` (numeric) - Multiplier achieved
  - `points_earned` (integer) - Points earned (0-3)
  - `created_at` (timestamptz)

  ## Point System
  - 0x to 25x = 0 points
  - 26x to 49x = 1 point
  - 50x to 99x = 2 points
  - 100x+ = 3 points

  ## Security
  - Enable RLS on all tables
  - Public read access for overlay display
  - Authenticated write access for management
*/

-- Create fever_tournaments table
CREATE TABLE IF NOT EXISTS fever_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  current_phase text NOT NULL DEFAULT 'group_stage' CHECK (current_phase IN ('group_stage', 'knockout')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create fever_groups table
CREATE TABLE IF NOT EXISTS fever_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_name text NOT NULL CHECK (group_name IN ('A', 'B', 'C', 'D')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tournament_id, group_name)
);

-- Create fever_participants table
CREATE TABLE IF NOT EXISTS fever_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  viewer_name text NOT NULL,
  slot_name text NOT NULL DEFAULT '',
  slot_image text DEFAULT '',
  points integer NOT NULL DEFAULT 0,
  spins_count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create fever_spins table
CREATE TABLE IF NOT EXISTS fever_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  multiplier numeric(10,2) NOT NULL DEFAULT 0,
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0 AND points_earned <= 3),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fever_groups_tournament ON fever_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_tournament ON fever_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_group ON fever_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_participant ON fever_spins(participant_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_tournament ON fever_spins(tournament_id);

-- Function to calculate points based on multiplier
CREATE OR REPLACE FUNCTION calculate_fever_points(multiplier numeric)
RETURNS integer AS $$
BEGIN
  IF multiplier >= 100 THEN
    RETURN 3;
  ELSIF multiplier >= 50 THEN
    RETURN 2;
  ELSIF multiplier >= 26 THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-calculate points when spin is inserted
CREATE OR REPLACE FUNCTION update_fever_spin_points()
RETURNS TRIGGER AS $$
BEGIN
  NEW.points_earned := calculate_fever_points(NEW.multiplier);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_fever_spin_points
  BEFORE INSERT ON fever_spins
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_spin_points();

-- Trigger to update participant stats when spin is added
CREATE OR REPLACE FUNCTION update_fever_participant_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE fever_participants
  SET 
    points = points + NEW.points_earned,
    spins_count = spins_count + 1,
    updated_at = now()
  WHERE id = NEW.participant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_participant_after_spin
  AFTER INSERT ON fever_spins
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_participant_stats();

-- Function to update group positions based on points
CREATE OR REPLACE FUNCTION update_fever_group_positions(group_uuid uuid)
RETURNS void AS $$
BEGIN
  WITH ranked_participants AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY points DESC, spins_count ASC) as new_position
    FROM fever_participants
    WHERE group_id = group_uuid
  )
  UPDATE fever_participants p
  SET position = rp.new_position
  FROM ranked_participants rp
  WHERE p.id = rp.id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update positions after participant stats change
CREATE OR REPLACE FUNCTION trigger_update_positions()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_fever_group_positions(NEW.group_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_positions_after_stats_change
  AFTER UPDATE OF points ON fever_participants
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_positions();

-- Enable RLS
ALTER TABLE fever_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_spins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fever_tournaments
CREATE POLICY "Anyone can view tournaments"
  ON fever_tournaments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert tournaments"
  ON fever_tournaments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tournaments"
  ON fever_tournaments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete tournaments"
  ON fever_tournaments FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for fever_groups
CREATE POLICY "Anyone can view groups"
  ON fever_groups FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert groups"
  ON fever_groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update groups"
  ON fever_groups FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete groups"
  ON fever_groups FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for fever_participants
CREATE POLICY "Anyone can view participants"
  ON fever_participants FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert participants"
  ON fever_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update participants"
  ON fever_participants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete participants"
  ON fever_participants FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for fever_spins
CREATE POLICY "Anyone can view spins"
  ON fever_spins FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert spins"
  ON fever_spins FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update spins"
  ON fever_spins FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete spins"
  ON fever_spins FOR DELETE
  TO authenticated
  USING (true);

-- Add overlay config for fever_champions to overlays table if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'overlays' 
    AND column_name = 'fever_champions_config'
  ) THEN
    ALTER TABLE overlays ADD COLUMN fever_champions_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;