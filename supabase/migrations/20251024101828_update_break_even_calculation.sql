/*
  # Update Break Even Calculation

  1. Changes
    - Update the trigger function to calculate both `initial_break_even` and `current_break_even`
    - Initial BE: total_invested / sum(payment_amounts) - shown during 'active' status
    - Current BE: total_won / total_invested - shown during 'opening' and 'completed' status
  
  2. Notes
    - Initial BE represents the target multiplier needed based on what was paid for bonuses
    - Current BE represents the actual performance during opening
*/

-- Update function to calculate both break even values
CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  total_payment numeric;
BEGIN
  -- Get current hunt with all items aggregated
  SELECT
    bh.id,
    bh.status,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.bet_amount), 0) as total_invested,
    COALESCE(SUM(bhi.payment_amount), 0) as total_payment,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id, bh.status;

  -- Calculate initial break even (based on payments)
  total_payment := hunt_record.total_payment;
  IF total_payment = 0 THEN
    total_payment := hunt_record.total_invested;
  END IF;

  -- Update the hunt with calculated values
  UPDATE bonus_hunts SET
    bonus_count = hunt_record.total_bonuses,
    opened_count = hunt_record.opened_bonuses,
    total_invested = CASE 
      WHEN manual_investment = true THEN total_invested
      ELSE hunt_record.total_invested
    END,
    total_won = hunt_record.total_won,
    initial_break_even = CASE 
      WHEN total_payment > 0 THEN (
        CASE 
          WHEN manual_investment = true THEN total_invested / total_payment
          ELSE hunt_record.total_invested / total_payment
        END
      )
      ELSE 0
    END,
    current_break_even = CASE 
      WHEN (CASE WHEN manual_investment = true THEN total_invested ELSE hunt_record.total_invested END) > 0 
      THEN hunt_record.total_won / (CASE WHEN manual_investment = true THEN total_invested ELSE hunt_record.total_invested END)
      ELSE 0
    END,
    profit_loss = hunt_record.total_won - (CASE WHEN manual_investment = true THEN total_invested ELSE hunt_record.total_invested END),
    updated_at = now()
  WHERE id = hunt_record.id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
