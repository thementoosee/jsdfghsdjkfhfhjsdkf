/*
  # Fix Fever Matches Public Access

  1. Changes
    - Drop existing authenticated-only policies for fever_matches
    - Create new public policies for full access to fever_matches
    - Allow anyone to insert, update, and delete matches

  2. Security
    - Enable RLS on fever_matches table
    - Add public policies for all operations
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view matches" ON fever_matches;
DROP POLICY IF EXISTS "Authenticated users can insert matches" ON fever_matches;
DROP POLICY IF EXISTS "Authenticated users can update matches" ON fever_matches;
DROP POLICY IF EXISTS "Authenticated users can delete matches" ON fever_matches;

-- Create public policies
CREATE POLICY "Anyone can view matches"
  ON fever_matches FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert matches"
  ON fever_matches FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update matches"
  ON fever_matches FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete matches"
  ON fever_matches FOR DELETE
  TO public
  USING (true);
