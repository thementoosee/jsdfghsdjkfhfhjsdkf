/*
  # Fix trigger function to use payment_amount instead of buy_cost

  1. Changes
    - Update `update_bonus_hunt_totals()` function to reference `payment_amount` column
    - This fixes the error when inserting/updating bonus hunt items
  
  2. Notes
    - The function calculates totals for bonus hunts
    - Previously referenced the old column name `buy_cost`
*/

CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
hunt_record RECORD;
BEGIN
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
UPDATE bonus_hunts SET
bonus_count = hunt_record.total_bonuses,
opened_count = hunt_record.opened_bonuses,
total_invested = hunt_record.total_invested,
total_won = hunt_record.total_won,
break_even = hunt_record.total_invested - hunt_record.total_won,
profit_loss = hunt_record.total_won - hunt_record.total_invested,
updated_at = now()
WHERE id = hunt_record.id;

RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;