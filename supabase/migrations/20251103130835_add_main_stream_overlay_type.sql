/*
  # Add main_stream overlay type
  
  1. Changes
    - Update overlays type constraint to include 'main_stream', 'chat', and 'alerts'
    - These new types support the main stream overlay composition
  
  2. Notes
    - main_stream: The composite overlay that contains all elements
    - chat: Chat overlay shown on the right side
    - alerts: Alert overlays for follows, subs, raids, etc.
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
