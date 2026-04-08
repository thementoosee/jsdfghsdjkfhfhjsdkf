/*
  # Fix Bonus Opening Item Multiplier Trigger
  
  1. Changes
    - Update trigger to prevent division by zero
    - Ensure multiplier is calculated safely
*/

-- Drop and recreate the trigger function with division by zero protection
CREATE OR REPLACE FUNCTION update_bonus_opening_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment > 0 THEN
    NEW.multiplier := NEW.payout / NEW.payment;
  ELSE
    NEW.multiplier := 0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;