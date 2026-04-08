/*
  # Add Missing Columns to StreamElements Config

  1. Changes
    - Add `account_id` column to streamelements_config
    - Add `channel_name` column to streamelements_config

  2. Notes
    - These columns are needed to store the StreamElements account details
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streamelements_config' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE streamelements_config ADD COLUMN account_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streamelements_config' AND column_name = 'channel_name'
  ) THEN
    ALTER TABLE streamelements_config ADD COLUMN channel_name text;
  END IF;
END $$;
