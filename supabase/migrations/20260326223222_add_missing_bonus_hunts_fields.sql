/*
  # Add Missing Fields to Bonus Hunts Table

  1. Changes
    - Add `streamer_name` column to store the streamer's name
    - Add `brand_logo_id` column to reference the brand logo
    - Add `hunt_number` column for sequential hunt numbering
  
  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'streamer_name'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN streamer_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'brand_logo_id'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN brand_logo_id uuid REFERENCES brand_logos(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'hunt_number'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN hunt_number integer;
  END IF;
END $$;
