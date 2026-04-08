/*
  # Create Fever Champions Matches System

  1. New Tables
    - `fever_matches`
      - `id` (uuid, primary key)
      - `tournament_id` (uuid, foreign key to fever_tournaments)
      - `group_id` (uuid, foreign key to fever_groups)
      - `round_number` (integer) - Round number in the group stage
      - `participant1_id` (uuid, foreign key to fever_participants)
      - `participant2_id` (uuid, foreign key to fever_participants)
      - `participant1_points` (integer) - Points scored by participant 1
      - `participant2_points` (integer) - Points scored by participant 2
      - `status` (text) - 'pending', 'in_progress', 'completed'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `fever_matches` table
    - Add policy for public read access
    - Add policy for authenticated users to manage matches

  3. Indexes
    - Index on tournament_id for faster queries
    - Index on group_id for faster queries
    - Index on status for filtering
*/

-- Create fever_matches table
CREATE TABLE IF NOT EXISTS fever_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES fever_tournaments(id) ON DELETE CASCADE NOT NULL,
  group_id uuid REFERENCES fever_groups(id) ON DELETE CASCADE NOT NULL,
  round_number integer NOT NULL DEFAULT 1,
  participant1_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE NOT NULL,
  participant2_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE NOT NULL,
  participant1_points integer DEFAULT 0,
  participant2_points integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE fever_matches ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view matches"
  ON fever_matches FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert matches"
  ON fever_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update matches"
  ON fever_matches FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete matches"
  ON fever_matches FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fever_matches_tournament_id ON fever_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_group_id ON fever_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_status ON fever_matches(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_fever_matches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fever_matches_updated_at
  BEFORE UPDATE ON fever_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_matches_updated_at();
