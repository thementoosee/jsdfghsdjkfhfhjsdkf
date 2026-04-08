/*
  # Fix opening number sequence

  1. Changes
    - Create sequence for opening numbers if not exists
    - Update opening_number column to use the sequence as default
    - Backfill existing records with sequential numbers
    - Set sequence to continue from last number
  
  2. Notes
    - Opening numbers will start from 1 and auto-increment
    - Existing openings will be numbered based on creation date
*/

-- Create sequence for opening numbers
CREATE SEQUENCE IF NOT EXISTS bonus_opening_number_seq START WITH 1;

-- Backfill existing records with sequential numbers based on created_at
DO $$
DECLARE
  opening_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR opening_record IN 
    SELECT id FROM bonus_openings WHERE opening_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE bonus_openings SET opening_number = counter WHERE id = opening_record.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set the sequence to continue from the last number
  PERFORM setval('bonus_opening_number_seq', GREATEST(counter, (SELECT COALESCE(MAX(opening_number), 0) FROM bonus_openings) + 1));
END $$;

-- Update the default value for opening_number column
ALTER TABLE bonus_openings ALTER COLUMN opening_number SET DEFAULT nextval('bonus_opening_number_seq');