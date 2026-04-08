/*
  # Fix Bonus Openings RLS Policies
  
  1. Changes
    - Drop existing restrictive policies
    - Add public access policies similar to bonus_hunts table
    - Allow anyone to insert, update, and delete without authentication
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view bonus openings" ON bonus_openings;
DROP POLICY IF EXISTS "Authenticated users can insert bonus openings" ON bonus_openings;
DROP POLICY IF EXISTS "Authenticated users can update bonus openings" ON bonus_openings;
DROP POLICY IF EXISTS "Authenticated users can delete bonus openings" ON bonus_openings;

DROP POLICY IF EXISTS "Anyone can view bonus opening items" ON bonus_opening_items;
DROP POLICY IF EXISTS "Authenticated users can insert bonus opening items" ON bonus_opening_items;
DROP POLICY IF EXISTS "Authenticated users can update bonus opening items" ON bonus_opening_items;
DROP POLICY IF EXISTS "Authenticated users can delete bonus opening items" ON bonus_opening_items;

-- Create new public policies for bonus_openings
CREATE POLICY "Public can view bonus openings"
  ON bonus_openings FOR SELECT
  USING (true);

CREATE POLICY "Public can insert bonus openings"
  ON bonus_openings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update bonus openings"
  ON bonus_openings FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete bonus openings"
  ON bonus_openings FOR DELETE
  USING (true);

-- Create new public policies for bonus_opening_items
CREATE POLICY "Public can view bonus opening items"
  ON bonus_opening_items FOR SELECT
  USING (true);

CREATE POLICY "Public can insert bonus opening items"
  ON bonus_opening_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update bonus opening items"
  ON bonus_opening_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete bonus opening items"
  ON bonus_opening_items FOR DELETE
  USING (true);