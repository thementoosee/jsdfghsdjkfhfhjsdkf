/*
  # Fix Initial Break Even Calculation

  1. Changes
    - Fix the initial_break_even formula
    - Should be: total_invested / total_payment (not inverted)
    - Example: If invested €1 and paid €100, need 100x to break even (1/100 = 0.01 is wrong!)
    - Correct: 100/1 = 100x needed
  
  2. Notes
    - Initial BE shows how much multiplier is needed based on payments vs bets
    - Current BE shows actual performance (won / invested)
*/

CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  total_payment numeric;
  invested_amount numeric;
BEGIN
  -- Get current hunt with all items aggregated
  SELECT
    bh.id,
    bh.status,
    bh.manual_investment,
    bh.total_invested as manual_invested,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.bet_amount), 0) as calculated_invested,
    COALESCE(SUM(bhi.payment_amount), 0) as total_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.status, bh.manual_investment, bh.total_invested;

  -- Determine which invested amount to use
  IF hunt_record.manual_investment = true THEN
    invested_amount := hunt_record.manual_invested;
  ELSE
    invested_amount := hunt_record.calculated_invested;
  END IF;

  -- Use payment if set, otherwise use bet amounts
  total_payment := hunt_record.total_payment;
  IF total_payment = 0 THEN
    total_payment := hunt_record.calculated_invested;
  END IF;

  -- Update the hunt with calculated values
  UPDATE bonus_hunts SET
    bonus_count = hunt_record.total_bonuses,
    opened_count = hunt_record.opened_bonuses,
    total_invested = invested_amount,
    total_won = hunt_record.total_won,
    initial_break_even = CASE 
      WHEN hunt_record.calculated_invested > 0 THEN total_payment / hunt_record.calculated_invested
      ELSE 0
    END,
    current_break_even = CASE 
      WHEN invested_amount > 0 THEN hunt_record.total_won / invested_amount
      ELSE 0
    END,
    profit_loss = hunt_record.total_won - invested_amount,
    updated_at = now()
  WHERE id = hunt_record.id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
