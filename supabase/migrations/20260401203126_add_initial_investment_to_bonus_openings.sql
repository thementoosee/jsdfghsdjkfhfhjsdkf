/*
  # Add Initial Investment to Bonus Openings

  1. Changes
    - Add initial_investment column to store the original hunt investment
    - Update trigger to use initial_investment for current_break_even calculation
    
  2. Formula
    - current_break_even = (initial_investment - total_payout) / remaining_payments
    - This ensures the break-even is calculated from the original hunt investment
*/

ALTER TABLE bonus_openings 
ADD COLUMN IF NOT EXISTS initial_investment numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_total_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
  v_initial_investment numeric;
  v_remaining_payment numeric;
BEGIN
  SELECT initial_break_even, initial_investment
  INTO v_initial_break_even, v_initial_investment
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  SELECT 
    COALESCE(SUM(payment), 0),
    COALESCE(SUM(payout), 0),
    COALESCE(SUM(CASE WHEN status = 'pending' THEN payment ELSE 0 END), 0)
  INTO v_total_investment, v_total_payout, v_remaining_payment
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  IF v_initial_investment = 0 THEN
    v_initial_investment := v_total_investment;
  END IF;
  
  v_profit_loss := v_total_payout - v_initial_investment;
  
  IF v_total_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_total_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_remaining_payment > 0 THEN
    v_current_break_even := (v_initial_investment - v_total_payout) / v_remaining_payment;
    IF v_current_break_even < 0 THEN
      v_current_break_even := 0;
    END IF;
  ELSIF v_total_payout >= v_initial_investment THEN
    v_current_break_even := 0;
  ELSE
    v_current_break_even := v_initial_break_even;
  END IF;
  
  UPDATE bonus_openings SET
    total_investment = v_total_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;