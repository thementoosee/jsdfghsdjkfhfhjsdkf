/*
  # Update Overlay Types to Include Chat

  ## Overview
  Updates the check constraint on the overlays table to include 'chat' as a valid type.

  ## Changes
  1. Drop the old check constraint
  2. Add a new check constraint with 'chat' included in the allowed types

  ## Valid Overlay Types
  - bar
  - background
  - bonus_hunt
  - bonus_opening
  - chill
  - chatbox (legacy)
  - chat (new)

  ## Notes
  - This migration preserves all existing data
  - Both 'chatbox' and 'chat' are now valid types
*/

-- Drop the old constraint
ALTER TABLE overlays DROP CONSTRAINT IF EXISTS overlays_type_check;

-- Add new constraint with 'chat' included
ALTER TABLE overlays ADD CONSTRAINT overlays_type_check 
  CHECK (type IN ('bar', 'background', 'bonus_hunt', 'bonus_opening', 'chill', 'chatbox', 'chat'));
