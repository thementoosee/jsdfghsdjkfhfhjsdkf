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
  - `tournament_number` (integer) - Auto-incrementing tournament number
  - `status` (text) - 'setup', 'active', 'completed'
  - `current_phase` (text) - 'group_stage', 'knockout'
  - `show_on_main_overlay` (boolean) - Show tournament on main overlay
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

  ### `fever_matches`
  Group stage matches
  - `id` (uuid, primary key)
  - `tournament_id` (uuid, foreign key)
  - `group_id` (uuid, foreign key)
  - `round_number` (integer)
  - `participant1_id` (uuid, foreign key)
  - `participant2_id` (uuid, foreign key)
  - `participant1_points` (integer)
  - `participant2_points` (integer)
  - `participant1_bonus_result` (numeric)
  - `participant1_bonus2_result` (numeric)
  - `participant2_bonus_result` (numeric)
  - `participant2_bonus2_result` (numeric)
  - `status` (text) - 'pending', 'in_progress', 'completed'
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `fever_playoff_matches`
  Playoff matches (quarter-finals, semi-finals, final)
  - `id` (uuid, primary key)
  - `tournament_id` (uuid, foreign key)
  - `stage` (text) - 'quarter_finals', 'semi_finals', 'final'
  - `match_number` (integer)
  - `participant1_id` (uuid, foreign key)
  - `participant2_id` (uuid, foreign key)
  - `participant1_bonus_result` (numeric)
  - `participant1_bonus2_result` (numeric)
  - `participant2_bonus_result` (numeric)
  - `participant2_bonus2_result` (numeric)
  - `winner_id` (uuid, foreign key)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Public access for all operations (no authentication required)
*/

-- Create fever_tournaments table
CREATE TABLE IF NOT EXISTS fever_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tournament_number integer,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  current_phase text NOT NULL DEFAULT 'group_stage' CHECK (current_phase IN ('group_stage', 'knockout')),
  show_on_main_overlay boolean DEFAULT false,
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

-- Create fever_matches table
CREATE TABLE IF NOT EXISTS fever_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  participant1_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_points integer NOT NULL DEFAULT 0,
  participant2_points integer NOT NULL DEFAULT 0,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create fever_playoff_matches table
CREATE TABLE IF NOT EXISTS fever_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('quarter_finals', 'semi_finals', 'final')),
  match_number integer NOT NULL,
  participant1_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  winner_id uuid REFERENCES fever_participants(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fever_groups_tournament ON fever_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_tournament ON fever_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_group ON fever_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_participant ON fever_spins(participant_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_tournament ON fever_spins(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_tournament ON fever_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_group ON fever_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_playoff_matches_tournament ON fever_playoff_matches(tournament_id);

-- Function to auto-increment tournament_number
CREATE OR REPLACE FUNCTION set_fever_tournament_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tournament_number IS NULL THEN
    SELECT COALESCE(MAX(tournament_number), 0) + 1
    INTO NEW.tournament_number
    FROM fever_tournaments;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tournament_number_before_insert
  BEFORE INSERT ON fever_tournaments
  FOR EACH ROW
  EXECUTE FUNCTION set_fever_tournament_number();

-- Function to calculate points based on multiplier (updated formula)
CREATE OR REPLACE FUNCTION calculate_fever_points(bonus1_result numeric, bonus2_result numeric)
RETURNS integer AS $$
DECLARE
  avg_result numeric;
BEGIN
  avg_result := (bonus1_result + bonus2_result) / 2;
  
  IF avg_result >= 10000 THEN
    RETURN 3;
  ELSIF avg_result >= 5000 THEN
    RETURN 2;
  ELSIF avg_result >= 2501 THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update match points when bonus results change
CREATE OR REPLACE FUNCTION update_fever_match_points()
RETURNS TRIGGER AS $$
BEGIN
  NEW.participant1_points := calculate_fever_points(
    COALESCE(NEW.participant1_bonus_result, 0),
    COALESCE(NEW.participant1_bonus2_result, 0)
  );
  
  NEW.participant2_points := calculate_fever_points(
    COALESCE(NEW.participant2_bonus_result, 0),
    COALESCE(NEW.participant2_bonus2_result, 0)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_match_points
  BEFORE INSERT OR UPDATE ON fever_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_match_points();

-- Function to update participant rankings automatically
CREATE OR REPLACE FUNCTION update_fever_participant_rankings()
RETURNS TRIGGER AS $$
DECLARE
  affected_group_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_group_id := OLD.group_id;
  ELSE
    affected_group_id := NEW.group_id;
  END IF;

  WITH match_results AS (
    SELECT 
      participant_id,
      SUM(points) as total_points
    FROM (
      SELECT participant1_id as participant_id, participant1_points as points
      FROM fever_matches
      WHERE group_id = affected_group_id
      UNION ALL
      SELECT participant2_id as participant_id, participant2_points as points
      FROM fever_matches
      WHERE group_id = affected_group_id
    ) combined
    GROUP BY participant_id
  ),
  ranked AS (
    SELECT 
      p.id,
      COALESCE(mr.total_points, 0) as points,
      ROW_NUMBER() OVER (ORDER BY COALESCE(mr.total_points, 0) DESC) as new_position
    FROM fever_participants p
    LEFT JOIN match_results mr ON p.id = mr.participant_id
    WHERE p.group_id = affected_group_id
  )
  UPDATE fever_participants p
  SET 
    points = ranked.points,
    position = ranked.new_position::integer,
    updated_at = now()
  FROM ranked
  WHERE p.id = ranked.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_rankings_after_match_change
  AFTER INSERT OR UPDATE OR DELETE ON fever_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_participant_rankings();

-- Function to advance playoff winners
CREATE OR REPLACE FUNCTION advance_playoff_winners()
RETURNS TRIGGER AS $$
DECLARE
  p1_avg numeric;
  p2_avg numeric;
  winner_participant_id uuid;
  next_stage text;
  next_match_number integer;
BEGIN
  IF NEW.participant1_id IS NULL OR NEW.participant2_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.participant1_bonus_result > 0 AND NEW.participant2_bonus_result > 0 THEN
    p1_avg := (NEW.participant1_bonus_result + NEW.participant1_bonus2_result) / 2;
    p2_avg := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2;
    
    IF p1_avg > p2_avg THEN
      winner_participant_id := NEW.participant1_id;
    ELSIF p2_avg > p1_avg THEN
      winner_participant_id := NEW.participant2_id;
    ELSE
      RETURN NEW;
    END IF;
    
    UPDATE fever_playoff_matches 
    SET winner_id = winner_participant_id 
    WHERE id = NEW.id;
    
    IF NEW.stage = 'quarter_finals' THEN
      next_stage := 'semi_finals';
      next_match_number := CASE 
        WHEN NEW.match_number <= 2 THEN 1 
        ELSE 2 
      END;
      
      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id
        AND stage = next_stage
        AND match_number = next_match_number
        AND participant1_id IS NULL;
      
      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id
          AND stage = next_stage
          AND match_number = next_match_number;
      END IF;
      
    ELSIF NEW.stage = 'semi_finals' THEN
      next_stage := 'final';
      
      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id
        AND stage = next_stage
        AND participant1_id IS NULL;
      
      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id
          AND stage = next_stage;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_advance_playoff_winners
  AFTER UPDATE ON fever_playoff_matches
  FOR EACH ROW
  WHEN (OLD.participant1_bonus_result IS DISTINCT FROM NEW.participant1_bonus_result 
     OR OLD.participant2_bonus_result IS DISTINCT FROM NEW.participant2_bonus_result)
  EXECUTE FUNCTION advance_playoff_winners();

-- Enable RLS
ALTER TABLE fever_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_playoff_matches ENABLE ROW LEVEL SECURITY;

-- Public RLS Policies for fever_tournaments
CREATE POLICY "Public can view tournaments" ON fever_tournaments FOR SELECT USING (true);
CREATE POLICY "Public can insert tournaments" ON fever_tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update tournaments" ON fever_tournaments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete tournaments" ON fever_tournaments FOR DELETE USING (true);

-- Public RLS Policies for fever_groups
CREATE POLICY "Public can view groups" ON fever_groups FOR SELECT USING (true);
CREATE POLICY "Public can insert groups" ON fever_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update groups" ON fever_groups FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete groups" ON fever_groups FOR DELETE USING (true);

-- Public RLS Policies for fever_participants
CREATE POLICY "Public can view participants" ON fever_participants FOR SELECT USING (true);
CREATE POLICY "Public can insert participants" ON fever_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update participants" ON fever_participants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete participants" ON fever_participants FOR DELETE USING (true);

-- Public RLS Policies for fever_spins
CREATE POLICY "Public can view spins" ON fever_spins FOR SELECT USING (true);
CREATE POLICY "Public can insert spins" ON fever_spins FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update spins" ON fever_spins FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete spins" ON fever_spins FOR DELETE USING (true);

-- Public RLS Policies for fever_matches
CREATE POLICY "Public can view matches" ON fever_matches FOR SELECT USING (true);
CREATE POLICY "Public can insert matches" ON fever_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update matches" ON fever_matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete matches" ON fever_matches FOR DELETE USING (true);

-- Public RLS Policies for fever_playoff_matches
CREATE POLICY "Public can view playoff matches" ON fever_playoff_matches FOR SELECT USING (true);
CREATE POLICY "Public can insert playoff matches" ON fever_playoff_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update playoff matches" ON fever_playoff_matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete playoff matches" ON fever_playoff_matches FOR DELETE USING (true);
