/*
  # Fix hunt number sequence

  1. Changes
    - Create sequence for hunt numbers if not exists
    - Update hunt_number column to use the sequence as default
    - Backfill existing records with sequential numbers
    - Set sequence to continue from last number
  
  2. Notes
    - Hunt numbers will start from 1 and auto-increment
    - Existing hunts will be numbered based on creation date
*/

-- Create sequence for hunt numbers
CREATE SEQUENCE IF NOT EXISTS bonus_hunt_number_seq START WITH 1;

-- Backfill existing records with sequential numbers based on created_at
DO $$
DECLARE
  hunt_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR hunt_record IN 
    SELECT id FROM bonus_hunts WHERE hunt_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE bonus_hunts SET hunt_number = counter WHERE id = hunt_record.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set the sequence to continue from the last number
  PERFORM setval('bonus_hunt_number_seq', GREATEST(counter, (SELECT COALESCE(MAX(hunt_number), 0) FROM bonus_hunts) + 1));
END $$;

-- Update the default value for hunt_number column
ALTER TABLE bonus_hunts ALTER COLUMN hunt_number SET DEFAULT nextval('bonus_hunt_number_seq');