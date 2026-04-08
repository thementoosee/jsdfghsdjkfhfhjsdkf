/*
  # Fix Bonus Hunt Break Even to Use Bet Amounts

  1. Changes
    - When payment_amount is NULL, use bet_amount for calculations
    - initial_break_even = total_invested / sum(COALESCE(payment_amount, bet_amount))
    - current_break_even = (total_invested - total_won) / sum_remaining_payments
    
  2. Formula
    - Payment amount is either the actual payment or the bet amount if not set
    - This allows break-even to calculate before payments are recorded
*/

CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  current_hunt RECORD;
  v_total_payment numeric;
  v_remaining_payment numeric;
  v_initial_break_even numeric;
  v_current_break_even numeric;
BEGIN
  -- Get current hunt settings
  SELECT manual_investment INTO current_hunt
  FROM bonus_hunts
  WHERE id = COALESCE(NEW.hunt_id, OLD.hunt_id);

  -- Get current hunt with all items aggregated
  -- Use COALESCE to fall back to bet_amount if payment_amount is NULL
  SELECT
    bh.id,
    bh.total_invested,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(COALESCE(bhi.payment_amount, bhi.bet_amount)), 0) as total_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'pending' THEN COALESCE(bhi.payment_amount, bhi.bet_amount) ELSE 0 END), 0) as remaining_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.total_invested;

  v_total_payment := hunt_record.total_payment;
  v_remaining_payment := hunt_record.remaining_payment;

  -- Calculate initial break even
  IF v_total_payment > 0 THEN
    IF current_hunt.manual_investment THEN
      v_initial_break_even := hunt_record.total_invested / v_total_payment;
    ELSE
      v_initial_break_even := v_total_payment / v_total_payment;
    END IF;
  ELSE
    v_initial_break_even := 0;
  END IF;

  -- Calculate current break even
  IF v_remaining_payment > 0 THEN
    IF current_hunt.manual_investment THEN
      v_current_break_even := (hunt_record.total_invested - hunt_record.total_won) / v_remaining_payment;
    ELSE
      v_current_break_even := (v_total_payment - hunt_record.total_won) / v_remaining_payment;
    END IF;
  ELSIF hunt_record.opened_bonuses > 0 THEN
    v_current_break_even := 0;
  ELSE
    v_current_break_even := v_initial_break_even;
  END IF;

  -- Update the hunt with calculated values
  IF current_hunt.manual_investment THEN
    UPDATE bonus_hunts SET
      bonus_count = hunt_record.total_bonuses,
      opened_count = hunt_record.opened_bonuses,
      total_won = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss = hunt_record.total_won - total_invested,
      updated_at = now()
    WHERE id = hunt_record.id;
  ELSE
    UPDATE bonus_hunts SET
      bonus_count = hunt_record.total_bonuses,
      opened_count = hunt_record.opened_bonuses,
      total_invested = hunt_record.total_payment,
      total_won = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss = hunt_record.total_won - hunt_record.total_payment,
      updated_at = now()
    WHERE id = hunt_record.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;