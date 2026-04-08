/*
  # Fix Current Break Even to Show Remaining Multiplier

  1. Changes
    - Fix `current_break_even` to show the remaining multiplier needed to break even
    - Formula: (total_invested - total_won) / total_payment
    - Example: Invested 100€, won 20€, paid 80€ → (100-20)/80 = 1x needed to break even
    
  2. Notes
    - `initial_break_even` remains correct: total_invested / total_payment (full multiplier from start)
    - `current_break_even` now shows: remaining multiplier to reach break even during opening
*/

CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  total_payment numeric;
  total_invest numeric;
BEGIN
  -- Get current hunt with all items aggregated
  SELECT
    bh.id,
    bh.status,
    bh.manual_investment,
    bh.total_invested as manual_total_invested,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.bet_amount), 0) as sum_bets,
    COALESCE(SUM(bhi.payment_amount), 0) as sum_payments,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.status, bh.manual_investment, bh.total_invested;

  -- Determine total invested (manual or calculated)
  IF hunt_record.manual_investment = true THEN
    total_invest := hunt_record.manual_total_invested;
  ELSE
    total_invest := hunt_record.sum_bets;
  END IF;

  -- Calculate total payment (use payment_amount if set, otherwise bet_amount)
  total_payment := hunt_record.sum_payments;
  IF total_payment = 0 THEN
    total_payment := hunt_record.sum_bets;
  END IF;

  -- Update the hunt with calculated values
  UPDATE bonus_hunts SET
    bonus_count = hunt_record.total_bonuses,
    opened_count = hunt_record.opened_bonuses,
    total_invested = total_invest,
    total_won = hunt_record.total_won,
    initial_break_even = CASE 
      WHEN total_payment > 0 THEN total_invest / total_payment
      ELSE 0
    END,
    current_break_even = CASE 
      WHEN total_payment > 0 THEN (total_invest - hunt_record.total_won) / total_payment
      ELSE 0
    END,
    profit_loss = hunt_record.total_won - total_invest,
    updated_at = now()
  WHERE id = hunt_record.id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
