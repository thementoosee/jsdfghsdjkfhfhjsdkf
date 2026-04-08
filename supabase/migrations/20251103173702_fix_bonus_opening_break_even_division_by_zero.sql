/*
  # Fix division by zero in bonus opening break even calculation

  1. Changes
    - Update `update_bonus_opening_totals` function to handle division by zero
    - When total_payout is 0, set current_break_even to initial_break_even value
    - Prevents error when inserting items with no payout yet
*/

CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_total_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
BEGIN
  SELECT initial_break_even
  INTO v_initial_break_even
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  SELECT 
    COALESCE(SUM(payment), 0),
    COALESCE(SUM(payout), 0)
  INTO v_total_investment, v_total_payout
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  v_profit_loss := v_total_payout - v_total_investment;
  
  IF v_total_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_total_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_total_payout > 0 AND v_total_payout < v_total_investment THEN
    v_current_break_even := v_total_investment / v_total_payout;
  ELSIF v_total_payout = 0 THEN
    v_current_break_even := v_initial_break_even;
  ELSE
    v_current_break_even := 0;
  END IF;
  
  UPDATE bonus_openings
  SET 
    total_investment = v_total_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even,
    updated_at = now()
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
