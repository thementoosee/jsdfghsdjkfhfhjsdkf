/*
  # Rename buy_cost to payment_amount in bonus hunt items

  1. Changes
    - Rename column `buy_cost` to `payment_amount` in `bonus_hunt_items` table
    - This better reflects that the column stores the payment/payout amount
    - Make payment_amount nullable since it may not be filled when adding slots
  
  2. Notes
    - Existing data is preserved during rename
    - No data loss occurs
*/

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bonus_hunt_items' AND column_name = 'buy_cost'
  ) THEN
    ALTER TABLE bonus_hunt_items RENAME COLUMN buy_cost TO payment_amount;
  END IF;
END $$;

ALTER TABLE bonus_hunt_items ALTER COLUMN payment_amount DROP NOT NULL;