/*
  # Add Missing Columns to bonus_openings

  1. Changes
    - Add `name` column to store opening session name
    - Add `source_hunt_number` to store the hunt number reference
    - Add `source_hunt_date` to store the hunt date reference
  
  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - Sets default values for existing rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'name'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'source_hunt_number'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN source_hunt_number integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'source_hunt_date'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN source_hunt_date timestamptz;
  END IF;
END $$;
