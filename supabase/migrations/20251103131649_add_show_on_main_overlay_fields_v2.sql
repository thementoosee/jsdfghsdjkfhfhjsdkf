/*
  # Add show_on_main_overlay fields
  
  1. Changes
    - Add show_on_main_overlay boolean field to bonus_hunts table
    - Add show_on_main_overlay boolean field to bonus_openings table
    - Add show_on_main_overlay boolean field to fever_tournaments table
    - All fields default to false
  
  2. Purpose
    - Control which session is displayed on the main stream overlay
    - Only one session of each type should have this flag active at a time
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'show_on_main_overlay'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN show_on_main_overlay boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'show_on_main_overlay'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN show_on_main_overlay boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fever_tournaments' AND column_name = 'show_on_main_overlay'
  ) THEN
    ALTER TABLE fever_tournaments ADD COLUMN show_on_main_overlay boolean DEFAULT false;
  END IF;
END $$;
