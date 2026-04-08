/*
  # Add initial_break_even field to bonus_openings

  1. Changes
    - Add `initial_break_even` column to `bonus_openings` table
    - This field stores the break-even multiplier at the start of the opening session
    - Default value is 0
    
  2. Notes
    - This allows tracking the initial target vs current target for bonus openings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'initial_break_even'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN initial_break_even numeric DEFAULT 0;
  END IF;
END $$;