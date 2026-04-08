/*
  # Add winner profile image to giveaways
  
  1. Changes
    - Add `winner_profile_image_url` column to `giveaways` table
    - This field stores the winner's Twitch profile image URL
  
  2. Notes
    - Field is nullable as not all giveaways have winners yet
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'winner_profile_image_url'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN winner_profile_image_url text;
  END IF;
END $$;