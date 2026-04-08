/*
  # Add hunt number to bonus hunts

  1. Changes
    - Add `hunt_number` column to `bonus_hunts` table
    - Create a sequence for auto-incrementing hunt numbers
    - Backfill existing records with sequential numbers based on creation date
  
  2. Notes
    - Hunt numbers will start from 1 and auto-increment
    - Existing hunts will be numbered based on creation date
*/

-- Create sequence for hunt numbers
CREATE SEQUENCE IF NOT EXISTS bonus_hunt_number_seq START WITH 1;

-- Add hunt_number column without unique constraint first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'hunt_number'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN hunt_number integer DEFAULT nextval('bonus_hunt_number_seq');
  END IF;
END $$;

-- Backfill existing records with sequential numbers based on created_at
DO $$
DECLARE
  hunt_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR hunt_record IN 
    SELECT id FROM bonus_hunts ORDER BY created_at ASC
  LOOP
    UPDATE bonus_hunts SET hunt_number = counter WHERE id = hunt_record.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set the sequence to continue from the last number
  PERFORM setval('bonus_hunt_number_seq', counter);
END $$;

-- Add unique constraint after backfilling
ALTER TABLE bonus_hunts ADD CONSTRAINT bonus_hunts_hunt_number_key UNIQUE (hunt_number);