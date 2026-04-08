/*
  # Add additional fields to giveaway tables

  1. Changes to giveaways table
    - Add `duration_minutes` (integer) - Duration of giveaway in minutes
    - Add `end_time` (timestamptz) - Auto-calculated end time
    - Add `winner_profile_image_url` (text) - Winner's profile image
    
  2. Changes to giveaway_participants table
    - Add `profile_image_url` (text) - Participant's profile image
    
  3. Functions & Triggers
    - Auto-calculate end_time when giveaway is created
*/

-- Add duration_minutes field to giveaways
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN duration_minutes integer DEFAULT 30;
  END IF;
END $$;

-- Add end_time field to giveaways
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN end_time timestamptz;
  END IF;
END $$;

-- Add winner_profile_image_url to giveaways
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'winner_profile_image_url'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN winner_profile_image_url text;
  END IF;
END $$;

-- Add profile_image_url to giveaway_participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaway_participants' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE giveaway_participants ADD COLUMN profile_image_url text DEFAULT '';
  END IF;
END $$;

-- Function to set end_time on insert
CREATE OR REPLACE FUNCTION set_giveaway_end_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL AND NEW.end_time IS NULL THEN
    NEW.end_time := NEW.created_at + (NEW.duration_minutes || ' minutes')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set end_time
DROP TRIGGER IF EXISTS set_giveaway_end_time_trigger ON giveaways;
CREATE TRIGGER set_giveaway_end_time_trigger
BEFORE INSERT ON giveaways
FOR EACH ROW
EXECUTE FUNCTION set_giveaway_end_time();
