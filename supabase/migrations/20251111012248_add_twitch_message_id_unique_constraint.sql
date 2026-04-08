/*
  # Add Twitch Message ID to prevent duplicates

  1. Changes
    - Add `twitch_message_id` column to `twitch_chat_messages` table
    - Add unique constraint to prevent duplicate messages from being stored
  
  2. Purpose
    - Prevents the same Twitch message from being inserted multiple times
    - Uses Twitch's native message ID for deduplication
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'twitch_chat_messages' AND column_name = 'twitch_message_id'
  ) THEN
    ALTER TABLE twitch_chat_messages 
    ADD COLUMN twitch_message_id text;
  END IF;
END $$;

-- Create unique index to prevent duplicate messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_twitch_message_id_unique 
ON twitch_chat_messages(twitch_message_id) 
WHERE twitch_message_id IS NOT NULL;