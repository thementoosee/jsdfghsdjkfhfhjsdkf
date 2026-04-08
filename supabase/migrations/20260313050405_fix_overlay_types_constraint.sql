/*
  # Fix overlay types constraint
  
  1. Changes
    - Update overlays type constraint to include all overlay types
    - fever_champions, fever_bracket, fever_groups, main_stream, alerts
*/

DO $$ BEGIN
  ALTER TABLE overlays DROP CONSTRAINT IF EXISTS overlays_type_check;
  
  ALTER TABLE overlays ADD CONSTRAINT overlays_type_check 
    CHECK (type IN (
      'bar',
      'background', 
      'bonus_hunt',
      'bonus_opening',
      'chill',
      'chatbox',
      'fever_champions',
      'fever_bracket',
      'fever_groups',
      'main_stream',
      'chat',
      'alerts'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;