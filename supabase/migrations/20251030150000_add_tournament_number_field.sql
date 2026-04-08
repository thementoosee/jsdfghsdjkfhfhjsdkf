/*
  # Add tournament number field

  1. Changes
    - Add `tournament_number` field to `fever_tournaments` table
    - This field auto-increments for each new tournament
    - Used to display tournaments as "NAME #N DATE"

  2. Notes
    - Tournament number is automatically assigned on insert
    - Based on the count of existing tournaments + 1
*/

-- Add tournament_number field
ALTER TABLE fever_tournaments
ADD COLUMN IF NOT EXISTS tournament_number integer;

-- Create function to auto-assign tournament number
CREATE OR REPLACE FUNCTION assign_fever_tournament_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tournament_number IS NULL THEN
    NEW.tournament_number := (
      SELECT COALESCE(MAX(tournament_number), 0) + 1
      FROM fever_tournaments
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-assign tournament number
DROP TRIGGER IF EXISTS assign_fever_tournament_number_trigger ON fever_tournaments;
CREATE TRIGGER assign_fever_tournament_number_trigger
  BEFORE INSERT ON fever_tournaments
  FOR EACH ROW
  EXECUTE FUNCTION assign_fever_tournament_number();

-- Update existing tournaments with numbers
DO $$
DECLARE
  tournament_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR tournament_record IN
    SELECT id FROM fever_tournaments
    WHERE tournament_number IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE fever_tournaments
    SET tournament_number = counter
    WHERE id = tournament_record.id;
    counter := counter + 1;
  END LOOP;
END $$;
