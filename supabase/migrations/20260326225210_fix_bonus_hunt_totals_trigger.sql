/*
  # Fix Bonus Hunt Totals Trigger Function

  1. Changes
    - Replace references to non-existent `break_even` column
    - Use `current_break_even` and `initial_break_even` instead
    - Calculate `current_break_even` as total remaining to win
    - Keep `initial_break_even` unchanged (set only once when hunt is created)
  
  2. Notes
    - Fixes error: column "break_even" does not exist
    - Maintains backward compatibility with existing data
*/

CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
  current_hunt RECORD;
BEGIN
  -- Get current hunt settings
  SELECT manual_investment INTO current_hunt
  FROM bonus_hunts
  WHERE id = COALESCE(NEW.hunt_id, OLD.hunt_id);

  -- Get current hunt with all items aggregated
  SELECT
    bh.id,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.payment_amount), 0) as total_invested,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id;

  -- Update the hunt with calculated values
  -- Only update total_invested if manual_investment is false
  IF current_hunt.manual_investment THEN
    UPDATE bonus_hunts SET
      bonus_count = hunt_record.total_bonuses,
      opened_count = hunt_record.opened_bonuses,
      total_won = hunt_record.total_won,
      current_break_even = total_invested - hunt_record.total_won,
      profit_loss = hunt_record.total_won - total_invested,
      updated_at = now()
    WHERE id = hunt_record.id;
  ELSE
    UPDATE bonus_hunts SET
      bonus_count = hunt_record.total_bonuses,
      opened_count = hunt_record.opened_bonuses,
      total_invested = hunt_record.total_invested,
      total_won = hunt_record.total_won,
      current_break_even = hunt_record.total_invested - hunt_record.total_won,
      profit_loss = hunt_record.total_won - hunt_record.total_invested,
      updated_at = now()
    WHERE id = hunt_record.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;