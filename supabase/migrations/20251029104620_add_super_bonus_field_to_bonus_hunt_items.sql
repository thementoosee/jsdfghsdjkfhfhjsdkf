/*
  # Add super bonus flag to bonus hunt items

  1. Changes
    - Add `is_super_bonus` boolean field to `bonus_hunt_items` table
    - Default value is false
    - Used to mark special super bonus slots in bonus hunts
  
  2. Notes
    - Super bonuses will be visually distinguished in the overlay
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunt_items' AND column_name = 'is_super_bonus'
  ) THEN
    ALTER TABLE bonus_hunt_items ADD COLUMN is_super_bonus boolean DEFAULT false;
  END IF;
END $$;