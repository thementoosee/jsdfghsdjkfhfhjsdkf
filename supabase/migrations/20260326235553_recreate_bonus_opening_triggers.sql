/*
  # Recreate Bonus Opening Triggers

  1. Purpose
    - Recreate missing triggers for bonus_opening_items table
    - Ensure multiplier is calculated automatically
    - Ensure opening totals are updated when items change

  2. Triggers
    - trigger_update_bonus_opening_item_multiplier: Calculates multiplier before insert/update
    - trigger_update_bonus_opening_totals: Updates opening totals after item changes
*/

-- Function to update item multiplier
CREATE OR REPLACE FUNCTION update_bonus_opening_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment > 0 THEN
    NEW.multiplier := NEW.payout / NEW.payment;
  ELSE
    NEW.multiplier := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for item multiplier
DROP TRIGGER IF EXISTS trigger_update_bonus_opening_item_multiplier ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_item_multiplier
  BEFORE INSERT OR UPDATE OF payout, payment ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_item_multiplier();

-- Function to update opening totals
CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_total_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
  v_payment numeric;
  v_total_items integer;
  v_opened_items integer;
  v_remaining_items integer;
  v_remaining_investment numeric;
BEGIN
  SELECT initial_break_even
  INTO v_initial_break_even
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  SELECT 
    COALESCE(SUM(payment), 0),
    COALESCE(SUM(payout), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'opened'),
    MAX(payment)
  INTO v_total_investment, v_total_payout, v_total_items, v_opened_items, v_payment
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  v_remaining_items := v_total_items - v_opened_items;
  v_remaining_investment := v_remaining_items * v_payment;
  v_profit_loss := v_total_payout - v_total_investment;
  
  IF v_total_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_total_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_total_payout > 0 AND v_total_payout < v_total_investment THEN
    v_current_break_even := (v_total_investment - v_total_payout) / v_remaining_investment;
  ELSIF v_total_payout >= v_total_investment THEN
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

-- Trigger for opening totals
DROP TRIGGER IF EXISTS trigger_update_bonus_opening_totals ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_totals
  AFTER INSERT OR UPDATE OR DELETE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_totals();