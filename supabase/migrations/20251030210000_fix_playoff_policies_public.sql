/*
  # Fix Playoff Policies for Public Access

  1. Changes
    - Drop existing authenticated-only policies
    - Add public access policies for all operations
    - Allow anyone to manage playoff matches
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can insert playoff matches" ON fever_playoff_matches;
DROP POLICY IF EXISTS "Authenticated users can update playoff matches" ON fever_playoff_matches;
DROP POLICY IF EXISTS "Authenticated users can delete playoff matches" ON fever_playoff_matches;

-- Public write access
CREATE POLICY "Anyone can insert playoff matches"
  ON fever_playoff_matches FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update playoff matches"
  ON fever_playoff_matches FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete playoff matches"
  ON fever_playoff_matches FOR DELETE
  TO public
  USING (true);
