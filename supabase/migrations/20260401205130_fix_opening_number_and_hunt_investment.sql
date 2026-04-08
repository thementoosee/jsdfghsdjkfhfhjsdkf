/*
  # Fix Opening Number Auto-increment and Hunt Investment

  1. Changes
    - Add auto-increment trigger for opening_number (sequential #1, #2, #3...)
    - Add source_hunt_investment column to store original hunt's total_invested
    - Update existing opening with source hunt investment

  2. Security
    - No changes to RLS policies
*/

-- Add column to store source hunt investment
ALTER TABLE bonus_openings 
ADD COLUMN IF NOT EXISTS source_hunt_investment numeric DEFAULT 0;

-- Create function to auto-increment opening_number
CREATE OR REPLACE FUNCTION set_opening_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opening_number IS NULL THEN
    SELECT COALESCE(MAX(opening_number), 0) + 1
    INTO NEW.opening_number
    FROM bonus_openings;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set opening_number on insert
DROP TRIGGER IF EXISTS set_opening_number_trigger ON bonus_openings;
CREATE TRIGGER set_opening_number_trigger
  BEFORE INSERT ON bonus_openings
  FOR EACH ROW
  EXECUTE FUNCTION set_opening_number();

-- Update existing opening with source hunt investment
UPDATE bonus_openings bo
SET source_hunt_investment = bh.total_invested
FROM bonus_hunts bh
WHERE bo.source_hunt_id = bh.id
  AND bo.source_hunt_investment = 0;

-- Update existing opening to have opening_number = 1
UPDATE bonus_openings
SET opening_number = 1
WHERE opening_number IS NULL;
