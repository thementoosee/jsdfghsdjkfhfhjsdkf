/*
  # Add profile image URL to giveaway participants
  
  1. Changes
    - Add `profile_image_url` column to `giveaway_participants` table
    - This field stores the profile image URL for visual representation during rolling
  
  2. Notes
    - Field is nullable to support existing participants without breaking changes
    - Default value is empty string for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaway_participants' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE giveaway_participants ADD COLUMN profile_image_url text DEFAULT '';
  END IF;
END $$;