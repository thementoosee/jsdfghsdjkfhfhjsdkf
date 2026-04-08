/*
  # Create Fever Playoffs System

  1. New Tables
    - `fever_playoff_matches`
      - `id` (uuid, primary key)
      - `tournament_id` (uuid, references fever_tournaments)
      - `stage` (text) - 'quarter_finals', 'semi_finals', 'final'
      - `match_number` (int) - 1-4 for quarters, 1-2 for semis, 1 for final
      - `participant1_id` (uuid, references fever_participants)
      - `participant2_id` (uuid, references fever_participants)
      - `participant1_bonus_result` (numeric) - First bonus payment
      - `participant1_bonus2_result` (numeric) - Second bonus payment
      - `participant2_bonus_result` (numeric) - First bonus payment
      - `participant2_bonus2_result` (numeric) - Second bonus payment
      - `winner_id` (uuid, references fever_participants)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `fever_playoff_matches` table
    - Add policies for public read access
    - Add policies for authenticated write access

  3. Indexes
    - Index on tournament_id for efficient queries
    - Index on stage for filtering
*/

-- Create playoff matches table
CREATE TABLE IF NOT EXISTS fever_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES fever_tournaments(id) ON DELETE CASCADE NOT NULL,
  stage text NOT NULL CHECK (stage IN ('quarter_finals', 'semi_finals', 'final')),
  match_number int NOT NULL,
  participant1_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_bonus_result numeric DEFAULT 0,
  participant1_bonus2_result numeric DEFAULT 0,
  participant2_bonus_result numeric DEFAULT 0,
  participant2_bonus2_result numeric DEFAULT 0,
  winner_id uuid REFERENCES fever_participants(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE fever_playoff_matches ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view playoff matches"
  ON fever_playoff_matches FOR SELECT
  TO public
  USING (true);

-- Authenticated write access
CREATE POLICY "Authenticated users can insert playoff matches"
  ON fever_playoff_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update playoff matches"
  ON fever_playoff_matches FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete playoff matches"
  ON fever_playoff_matches FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fever_playoff_matches_tournament
  ON fever_playoff_matches(tournament_id);

CREATE INDEX IF NOT EXISTS idx_fever_playoff_matches_stage
  ON fever_playoff_matches(stage);

-- Function to calculate playoff match winner
CREATE OR REPLACE FUNCTION calculate_playoff_winner()
RETURNS TRIGGER AS $$
DECLARE
  p1_points numeric;
  p2_points numeric;
BEGIN
  -- Calculate average points for each participant
  IF NEW.participant1_bonus_result > 0 OR NEW.participant1_bonus2_result > 0 THEN
    IF NEW.participant1_bonus_result > 0 AND NEW.participant1_bonus2_result > 0 THEN
      p1_points := (NEW.participant1_bonus_result + NEW.participant1_bonus2_result) / 2.0;
    ELSIF NEW.participant1_bonus_result > 0 THEN
      p1_points := NEW.participant1_bonus_result;
    ELSE
      p1_points := NEW.participant1_bonus2_result;
    END IF;
  ELSE
    p1_points := 0;
  END IF;

  IF NEW.participant2_bonus_result > 0 OR NEW.participant2_bonus2_result > 0 THEN
    IF NEW.participant2_bonus_result > 0 AND NEW.participant2_bonus2_result > 0 THEN
      p2_points := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2.0;
    ELSIF NEW.participant2_bonus_result > 0 THEN
      p2_points := NEW.participant2_bonus_result;
    ELSE
      p2_points := NEW.participant2_bonus2_result;
    END IF;
  ELSE
    p2_points := 0;
  END IF;

  -- Determine winner
  IF p1_points > p2_points THEN
    NEW.winner_id := NEW.participant1_id;
  ELSIF p2_points > p1_points THEN
    NEW.winner_id := NEW.participant2_id;
  ELSE
    NEW.winner_id := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate winner
CREATE TRIGGER calculate_playoff_winner_trigger
  BEFORE INSERT OR UPDATE ON fever_playoff_matches
  FOR EACH ROW
  EXECUTE FUNCTION calculate_playoff_winner();
