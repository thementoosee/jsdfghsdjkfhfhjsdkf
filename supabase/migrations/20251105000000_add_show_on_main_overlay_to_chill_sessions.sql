/*
  # Add show_on_main_overlay to chill_sessions
  
  1. Changes
    - Add show_on_main_overlay boolean field to chill_sessions table
    - Defaults to false for safety
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chill_sessions' AND column_name = 'show_on_main_overlay'
  ) THEN
    ALTER TABLE chill_sessions ADD COLUMN show_on_main_overlay boolean DEFAULT false;
  END IF;
END $$;
