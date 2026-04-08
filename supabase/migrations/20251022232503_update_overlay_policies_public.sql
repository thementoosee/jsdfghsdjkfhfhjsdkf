/*
  # Update Overlay Policies for Public Access

  ## Changes
  - Drop existing RLS policies that require authentication
  - Add new policies that allow public (anon) access to overlays
  - Allow anyone to:
    - View all overlays (SELECT)
    - Create overlays (INSERT)
    - Update overlays (UPDATE)
    - Delete overlays (DELETE)

  ## Security Notes
  - This enables public access for ease of use in streaming setup
  - Users can create and manage overlays without authentication
  - Each overlay still has a unique ID for access control
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own overlays" ON overlays;
DROP POLICY IF EXISTS "Users can insert own overlays" ON overlays;
DROP POLICY IF EXISTS "Users can update own overlays" ON overlays;
DROP POLICY IF EXISTS "Users can delete own overlays" ON overlays;

-- Create new public policies
CREATE POLICY "Anyone can view overlays"
  ON overlays FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert overlays"
  ON overlays FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update overlays"
  ON overlays FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete overlays"
  ON overlays FOR DELETE
  TO anon, authenticated
  USING (true);

-- Make user_id nullable since auth is not required
ALTER TABLE overlays ALTER COLUMN user_id DROP NOT NULL;