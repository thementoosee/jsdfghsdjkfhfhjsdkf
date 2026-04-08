/*
  # Fix Giveaway RLS Policies for Public Access

  1. Changes
    - Drop existing authenticated-only policies
    - Create new public policies for all operations
    
  2. Security
    - Enable public read/write access (no authentication in system)
    - Matches pattern used by bonus_hunts and other tables
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can insert giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can update giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can delete giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can delete participants" ON giveaway_participants;

-- Create public policies for giveaways
CREATE POLICY "Anyone can insert giveaways"
  ON giveaways FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update giveaways"
  ON giveaways FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete giveaways"
  ON giveaways FOR DELETE
  TO public
  USING (true);

-- Create public policy for participants delete
CREATE POLICY "Anyone can delete participants"
  ON giveaway_participants FOR DELETE
  TO public
  USING (true);
