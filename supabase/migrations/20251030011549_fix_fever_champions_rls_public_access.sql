/*
  # Fix Fever Champions League RLS Policies for Public Access

  ## Changes
  - Update all RLS policies to allow public access (anon role)
  - This allows the application to work without authentication
  - Maintains security through application-level controls

  ## Security Notes
  - All operations now available to anonymous users
  - Suitable for single-user/trusted environment applications
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view tournaments" ON fever_tournaments;
DROP POLICY IF EXISTS "Authenticated users can insert tournaments" ON fever_tournaments;
DROP POLICY IF EXISTS "Authenticated users can update tournaments" ON fever_tournaments;
DROP POLICY IF EXISTS "Authenticated users can delete tournaments" ON fever_tournaments;

DROP POLICY IF EXISTS "Anyone can view groups" ON fever_groups;
DROP POLICY IF EXISTS "Authenticated users can insert groups" ON fever_groups;
DROP POLICY IF EXISTS "Authenticated users can update groups" ON fever_groups;
DROP POLICY IF EXISTS "Authenticated users can delete groups" ON fever_groups;

DROP POLICY IF EXISTS "Anyone can view participants" ON fever_participants;
DROP POLICY IF EXISTS "Authenticated users can insert participants" ON fever_participants;
DROP POLICY IF EXISTS "Authenticated users can update participants" ON fever_participants;
DROP POLICY IF EXISTS "Authenticated users can delete participants" ON fever_participants;

DROP POLICY IF EXISTS "Anyone can view spins" ON fever_spins;
DROP POLICY IF EXISTS "Authenticated users can insert spins" ON fever_spins;
DROP POLICY IF EXISTS "Authenticated users can update spins" ON fever_spins;
DROP POLICY IF EXISTS "Authenticated users can delete spins" ON fever_spins;

-- Create new public policies for fever_tournaments
CREATE POLICY "Public can view tournaments"
  ON fever_tournaments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert tournaments"
  ON fever_tournaments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can update tournaments"
  ON fever_tournaments FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete tournaments"
  ON fever_tournaments FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create new public policies for fever_groups
CREATE POLICY "Public can view groups"
  ON fever_groups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert groups"
  ON fever_groups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can update groups"
  ON fever_groups FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete groups"
  ON fever_groups FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create new public policies for fever_participants
CREATE POLICY "Public can view participants"
  ON fever_participants FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert participants"
  ON fever_participants FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can update participants"
  ON fever_participants FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete participants"
  ON fever_participants FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create new public policies for fever_spins
CREATE POLICY "Public can view spins"
  ON fever_spins FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert spins"
  ON fever_spins FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can update spins"
  ON fever_spins FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete spins"
  ON fever_spins FOR DELETE
  TO anon, authenticated
  USING (true);