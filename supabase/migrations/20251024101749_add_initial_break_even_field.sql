/*
  # Add Initial Break Even Field

  1. Changes
    - Add `initial_break_even` column to `bonus_hunts` table
    - This represents the break even multiplier at the start (before opening)
    - The existing `break_even` column will be renamed to `current_break_even` to represent the live break even during opening
  
  2. Notes
    - Initial BE: Calculated when hunt status is 'active' (before opening starts)
    - Current BE: Calculated during 'opening' status based on total_won / total_invested
*/

-- Add initial_break_even column
ALTER TABLE bonus_hunts 
ADD COLUMN IF NOT EXISTS initial_break_even numeric DEFAULT 0;

-- Rename existing break_even to current_break_even for clarity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bonus_hunts' AND column_name = 'break_even'
  ) THEN
    ALTER TABLE bonus_hunts RENAME COLUMN break_even TO current_break_even;
  END IF;
END $$;
