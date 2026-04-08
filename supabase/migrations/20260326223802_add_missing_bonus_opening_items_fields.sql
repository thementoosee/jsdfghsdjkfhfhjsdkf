/*
  # Add Missing Fields to Bonus Opening Items

  1. Changes
    - Add `payment` column (alias for payment_amount)
    - Add `payout` column (alias for win_amount)
    - Add `multiplier` column for calculated multiplier
    - Add `status` column for pending/opened status
    - Add `order_index` column for ordering
    - Add `super_bonus` column (alias for is_super_bonus)
  
  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'payment'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN payment numeric(10,2);
    UPDATE bonus_opening_items SET payment = payment_amount WHERE payment_amount IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'payout'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN payout numeric(10,2);
    UPDATE bonus_opening_items SET payout = win_amount WHERE win_amount IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'multiplier'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN multiplier numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'status'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN status text DEFAULT 'pending' CHECK (status IN ('pending', 'opened'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN order_index integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_opening_items' AND column_name = 'super_bonus'
  ) THEN
    ALTER TABLE bonus_opening_items ADD COLUMN super_bonus boolean;
    UPDATE bonus_opening_items SET super_bonus = is_super_bonus WHERE is_super_bonus IS NOT NULL;
  END IF;
END $$;
