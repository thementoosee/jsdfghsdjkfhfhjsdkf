/*
  # Add opening number to bonus openings

  1. Changes
    - Add `opening_number` column to `bonus_openings` table
    - Create a sequence for auto-incrementing opening numbers
    - Backfill existing records with sequential numbers based on creation date
  
  2. Notes
    - Opening numbers will start from 1 and auto-increment
    - Existing openings will be numbered based on creation date
*/

-- Create sequence for opening numbers
CREATE SEQUENCE IF NOT EXISTS bonus_opening_number_seq START WITH 1;

-- Add opening_number column without unique constraint first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'opening_number'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN opening_number integer DEFAULT nextval('bonus_opening_number_seq');
  END IF;
END $$;

-- Backfill existing records with sequential numbers based on created_at
DO $$
DECLARE
  opening_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR opening_record IN 
    SELECT id FROM bonus_openings ORDER BY created_at ASC
  LOOP
    UPDATE bonus_openings SET opening_number = counter WHERE id = opening_record.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set the sequence to continue from the last number
  PERFORM setval('bonus_opening_number_seq', counter);
END $$;

-- Add unique constraint after backfilling
ALTER TABLE bonus_openings ADD CONSTRAINT bonus_openings_opening_number_key UNIQUE (opening_number);