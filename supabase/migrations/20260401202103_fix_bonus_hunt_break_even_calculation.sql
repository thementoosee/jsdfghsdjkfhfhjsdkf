/*
  # Fix Bonus Hunt Break Even Calculation

  1. Changes
    - Fix `initial_break_even` to calculate: total_invested / sum(payment_amounts)
    - Fix `current_break_even` to calculate: (total_invested - total_won) / remaining_investment
    - When all bonuses are opened, current_break_even = 0
    - When no bonuses are opened yet, current_break_even = initial_break_even

  2. Formula
    - initial_break_even = total_invested / total_payment (multiplier needed from start)
    - current_break_even = (total_invested - total_won) / remaining_payment (multiplier needed on remaining bonuses)
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
  SELECT
    bh.id,
    bh.total_invested,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.payment_amount), 0) as total_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'pending' THEN bhi.payment_amount ELSE 0 END), 0) as remaining_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.total_invested;

  -- Calculate total payment for calculations
  IF current_hunt.manual_investment THEN
    v_total_payment := hunt_record.total_payment;
  ELSE
    v_total_payment := hunt_record.total_payment;
  END IF;

  v_remaining_payment := hunt_record.remaining_payment;

  -- Calculate initial break even
  IF v_total_payment > 0 THEN
    v_initial_break_even := (CASE 
      WHEN current_hunt.manual_investment THEN hunt_record.total_invested 
      ELSE hunt_record.total_payment 
    END) / v_total_payment;
  ELSE
    v_initial_break_even := 0;
  END IF;

  -- Calculate current break even
  IF v_remaining_payment > 0 THEN
    v_current_break_even := ((CASE 
      WHEN current_hunt.manual_investment THEN hunt_record.total_invested 
      ELSE hunt_record.total_payment 
    END) - hunt_record.total_won) / v_remaining_payment;
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