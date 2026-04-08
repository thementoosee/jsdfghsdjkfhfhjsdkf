/*
  # Fix Bonus Opening Items Update Policy

  1. Changes
    - Drop existing update policy that lacks USING clause
    - Create new update policy with both USING and WITH CHECK clauses
    - This ensures UPDATE operations can select and modify rows properly
*/

DROP POLICY IF EXISTS "Bonus opening items are updatable by anyone" ON bonus_opening_items;
DROP POLICY IF EXISTS "Public can update bonus opening items" ON bonus_opening_items;

CREATE POLICY "Public can update bonus opening items"
  ON bonus_opening_items FOR UPDATE
  USING (true)
  WITH CHECK (true);
