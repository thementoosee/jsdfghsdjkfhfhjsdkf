/*
  # Add Fever Overlay Types to Constraint

  1. Changes
    - Drop existing overlays_type_check constraint
    - Add new constraint that includes 'fever_champions' and 'fever_bracket' types
  
  2. Notes
    - This allows creation of Fever Champions League and Fever Bracket overlays
*/

-- Drop existing constraint
ALTER TABLE overlays DROP CONSTRAINT IF EXISTS overlays_type_check;

-- Add new constraint with all overlay types including fever types
ALTER TABLE overlays ADD CONSTRAINT overlays_type_check 
  CHECK (type IN (
    'bar',
    'background', 
    'bonus_hunt',
    'bonus_opening',
    'chill',
    'chatbox',
    'chat',
    'fever_champions',
    'fever_bracket'
  ));
