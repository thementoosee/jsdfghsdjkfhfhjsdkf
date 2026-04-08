/*
  # Fix Giveaway RLS Policies for Public Access

  1. Changes
    - Drop existing restrictive policies
    - Create new public policies for all operations
    - Allow anyone to create, read, update, and delete giveaways
    - Allow anyone to manage participants

  2. Security Note
    - This app doesn't use authentication
    - All operations are public for overlay and dashboard use
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can insert giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can update giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can delete giveaways" ON giveaways;

DROP POLICY IF EXISTS "Anyone can view participants" ON giveaway_participants;
DROP POLICY IF EXISTS "Anyone can insert participants" ON giveaway_participants;
DROP POLICY IF EXISTS "Authenticated users can delete participants" ON giveaway_participants;

-- Create new public policies for giveaways
CREATE POLICY "Public can view giveaways"
  ON giveaways FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert giveaways"
  ON giveaways FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update giveaways"
  ON giveaways FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete giveaways"
  ON giveaways FOR DELETE
  TO public
  USING (true);

-- Create new public policies for participants
CREATE POLICY "Public can view participants"
  ON giveaway_participants FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert participants"
  ON giveaway_participants FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update participants"
  ON giveaway_participants FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete participants"
  ON giveaway_participants FOR DELETE
  TO public
  USING (true);