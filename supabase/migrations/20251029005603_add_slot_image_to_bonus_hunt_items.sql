/*
  # Add slot image URL to bonus hunt items

  1. Changes
    - Add `slot_image_url` column to `bonus_hunt_items` table
      - Stores the URL or data URI for the slot machine image
      - Optional field (nullable)
      - Used for visual display in overlays

  2. Purpose
    - Enable visual slot representation in bonus hunt overlays
    - Improve user experience with slot images
*/

-- Add slot_image_url column to bonus_hunt_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunt_items' AND column_name = 'slot_image_url'
  ) THEN
    ALTER TABLE bonus_hunt_items ADD COLUMN slot_image_url text;
  END IF;
END $$;
