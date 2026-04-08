/*
  # Fix Bonus Opening Current Break Even Calculation - Real Time

  1. Purpose
    - Fix the current_break_even calculation to work in real-time
    - Calculate based on remaining bonuses and their total bet amount
    - Update instantly when items are opened

  2. Changes
    - Update the update_bonus_opening_totals function
    - Calculate remaining investment based on actual pending items
    - Use correct formula: (initial_investment - total_payout) / total_bet_of_remaining

  3. Formula
    - If no items opened: use initial_break_even
    - If all items opened: 0x
    - Otherwise: (start_amount - total_payout) / sum(payment of pending items)
*/

CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_initial_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
  v_opened_items integer;
  v_total_items integer;
  v_remaining_bet_sum numeric;
  v_amount_needed numeric;
BEGIN
  SELECT initial_investment, initial_break_even
  INTO v_initial_investment, v_initial_break_even
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  SELECT 
    COALESCE(SUM(payout), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'opened')
  INTO v_total_payout, v_total_items, v_opened_items
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  v_profit_loss := v_total_payout - v_initial_investment;
  
  IF v_initial_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_initial_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_opened_items = 0 THEN
    v_current_break_even := v_initial_break_even;
  ELSIF v_opened_items = v_total_items THEN
    v_current_break_even := 0;
  ELSE
    SELECT COALESCE(SUM(payment), 0)
    INTO v_remaining_bet_sum
    FROM bonus_opening_items
    WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id)
      AND status = 'pending';
    
    IF v_remaining_bet_sum > 0 THEN
      v_amount_needed := GREATEST(0, v_initial_investment - v_total_payout);
      v_current_break_even := v_amount_needed / v_remaining_bet_sum;
    ELSE
      v_current_break_even := 0;
    END IF;
  END IF;
  
  UPDATE bonus_openings SET
    total_investment = v_initial_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even,
    updated_at = now()
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bonus_opening_totals ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_totals
  AFTER INSERT OR UPDATE OR DELETE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_totals();