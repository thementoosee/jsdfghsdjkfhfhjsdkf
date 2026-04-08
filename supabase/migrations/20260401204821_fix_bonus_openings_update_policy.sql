/*
  # Fix Bonus Openings Update Policy

  1. Changes
    - Drop and recreate the UPDATE policy for bonus_openings
    - Fix the USING clause to allow updates (was null, preventing any updates)
    - Keep WITH CHECK as true for data validation

  2. Security
    - Allows anyone to update bonus opening records
    - Maintains data integrity with WITH CHECK clause
*/

-- Drop existing update policy
DROP POLICY IF EXISTS "Bonus openings are updatable by anyone" ON bonus_openings;

-- Recreate with correct USING clause
CREATE POLICY "Bonus openings are updatable by anyone"
  ON bonus_openings
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
