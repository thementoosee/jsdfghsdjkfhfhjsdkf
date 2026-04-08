/*
  # Add automatic multiplier calculation for bonus hunt items

  ## Changes
  1. Creates a trigger function to automatically calculate:
     - `result_amount` from `payment_amount`
     - `multiplier` as the ratio between payment and bet
     - Updates `status` to 'opened' when payment is added
  
  ## Important Notes
  - Multiplier = payment_amount / bet_amount
  - Result amount = payment_amount (they're the same value)
  - Status changes to 'opened' when payment_amount is set
*/

-- Function to calculate multiplier and result when payment is added
CREATE OR REPLACE FUNCTION calculate_bonus_hunt_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  -- If payment_amount is set and changed
  IF NEW.payment_amount IS NOT NULL THEN
    -- Set result_amount to the same as payment_amount
    NEW.result_amount := NEW.payment_amount;
    
    -- Calculate multiplier based on payment/bet ratio
    IF NEW.bet_amount > 0 THEN
      NEW.multiplier := NEW.payment_amount / NEW.bet_amount;
    ELSE
      NEW.multiplier := 0;
    END IF;
    
    -- Mark as opened
    NEW.status := 'opened';
    NEW.opened_at := COALESCE(NEW.opened_at, now());
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_calculate_hunt_item_multiplier ON bonus_hunt_items;
CREATE TRIGGER trigger_calculate_hunt_item_multiplier
  BEFORE INSERT OR UPDATE ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_bonus_hunt_item_multiplier();
