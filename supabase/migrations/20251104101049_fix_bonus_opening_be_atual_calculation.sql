/*
  # Fix BE Atual calculation for Bonus Opening

  1. Changes
    - Update `current_break_even` calculation to show the average multiplier needed on remaining bonuses
    - Formula: (Target - Total Pago) ÷ (Bet × Bónus Restantes)
    - When all bonuses are opened, current_break_even = 0

  2. Calculation Logic
    - **BE Inicial**: total_investment ÷ payment (set on first item insert)
    - **AVG**: total_payout ÷ number of opened items
    - **BE Atual**: (total_investment - total_payout) ÷ (payment × remaining_items)
      - Shows what multiplier is needed on each remaining bonus to break even
      - When total_payout >= total_investment, BE Atual = 0 (already profitable)
      - When no items remain, BE Atual = 0
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
  v_profit_loss := v_total_payout - v_total_investment;
  
  IF v_total_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_total_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  IF v_remaining_items > 0 AND v_total_payout < v_total_investment AND v_payment > 0 THEN
    v_remaining_investment := v_payment * v_remaining_items;
    v_current_break_even := (v_total_investment - v_total_payout) / v_remaining_investment;
  ELSIF v_opened_items = 0 THEN
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