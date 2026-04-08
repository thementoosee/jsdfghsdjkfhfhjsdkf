/*
  # Add alerts overlay type

  1. Changes
    - Add 'alerts' to the overlay type constraint to support alerts overlay
  
  2. Notes
    - This allows creating overlays of type 'alerts' for displaying alerts
*/

ALTER TABLE overlays DROP CONSTRAINT IF EXISTS overlays_type_check;

ALTER TABLE overlays ADD CONSTRAINT overlays_type_check 
  CHECK (type = ANY (ARRAY['bar'::text, 'background'::text, 'bonus_hunt'::text, 'bonus_opening'::text, 'chill'::text, 'chatbox'::text, 'chat'::text, 'alerts'::text, 'fever_champions'::text, 'fever_bracket'::text, 'fever_groups'::text]));
