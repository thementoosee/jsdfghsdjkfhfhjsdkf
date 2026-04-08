/*
  # Add streamer_name field to bonus_hunts

  1. Changes
    - Add `streamer_name` field to bonus_hunts table to track who made the hunt
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'streamer_name'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN streamer_name text;
  END IF;
END $$;
