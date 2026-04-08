/*
  # Add Missing Fields to Bonus Openings

  1. Changes
    - Add `total_investment` column for total investment amount
    - Add `total_payout` column for total payout amount
    - Add `current_break_even` column for current break even multiplier
    - Add `profit_loss` column for profit/loss amount
    - Add `current_multiplier` column for current overall multiplier
    - Add `hunt_number` column for hunt reference number
  
  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'total_investment'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN total_investment numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'total_payout'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN total_payout numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'current_break_even'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN current_break_even numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'profit_loss'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN profit_loss numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'current_multiplier'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN current_multiplier numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_openings' AND column_name = 'hunt_number'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN hunt_number integer;
  END IF;
END $$;
