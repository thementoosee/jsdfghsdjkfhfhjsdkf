/*
  # Add Missing Fields to Bonus Hunt Items

  1. Changes
    - Add `slot_image_url` column to store the slot image
    - Add `is_super_bonus` column to mark super bonuses
  
  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunt_items' AND column_name = 'slot_image_url'
  ) THEN
    ALTER TABLE bonus_hunt_items ADD COLUMN slot_image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunt_items' AND column_name = 'is_super_bonus'
  ) THEN
    ALTER TABLE bonus_hunt_items ADD COLUMN is_super_bonus boolean DEFAULT false;
  END IF;
END $$;
