/*
  # Lock initial_break_even once hunt moves to opening status

  ## Problem
  The trigger `update_bonus_hunt_totals()` was recalculating and overwriting
  `initial_break_even` on every `bonus_hunt_items` change, including while
  bonuses were being opened. As payment_amount values were entered they differ
  from bet_amount, so COALESCE(payment_amount, bet_amount) drifted and caused
  `initial_break_even` to change in real-time — which is incorrect.

  ## Fix
  Only recalculate `initial_break_even` when the hunt's status is 'active'.
  Once the hunt moves to 'opening' or 'completed', the stored value is preserved
  and only `current_break_even` continues to update.
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
  -- Fetch current hunt settings, status, and the already-stored initial_break_even
  SELECT manual_investment, status, initial_break_even
  INTO current_hunt
  FROM bonus_hunts
  WHERE id = COALESCE(NEW.hunt_id, OLD.hunt_id);

  -- Aggregate item totals
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

  v_total_payment    := hunt_record.total_payment;
  v_remaining_payment := hunt_record.remaining_payment;

  -- ---------------------------------------------------------------
  -- LOCK: only recalculate initial_break_even while status = 'active'
  -- Once the hunt is in 'opening' or 'completed', keep the stored value.
  -- ---------------------------------------------------------------
  IF current_hunt.status = 'active' THEN
    IF v_total_payment > 0 THEN
      IF current_hunt.manual_investment THEN
        v_initial_break_even := hunt_record.total_invested / v_total_payment;
      ELSE
        -- For non-manual hunts total_invested equals total_payment, so BE = 1x
        v_initial_break_even := v_total_payment / v_total_payment;
      END IF;
    ELSE
      v_initial_break_even := 0;
    END IF;
  ELSE
    -- Hunt is opening/completed — preserve the value that was set during active phase
    v_initial_break_even := current_hunt.initial_break_even;
  END IF;

  -- Calculate current_break_even (always live)
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

  -- Persist changes
  IF current_hunt.manual_investment THEN
    UPDATE bonus_hunts SET
      bonus_count       = hunt_record.total_bonuses,
      opened_count      = hunt_record.opened_bonuses,
      total_won         = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss       = hunt_record.total_won - total_invested,
      updated_at        = now()
    WHERE id = hunt_record.id;
  ELSE
    UPDATE bonus_hunts SET
      bonus_count        = hunt_record.total_bonuses,
      opened_count       = hunt_record.opened_bonuses,
      total_invested     = hunt_record.total_payment,
      total_won          = hunt_record.total_won,
      initial_break_even = v_initial_break_even,
      current_break_even = GREATEST(0, v_current_break_even),
      profit_loss        = hunt_record.total_won - hunt_record.total_payment,
      updated_at         = now()
    WHERE id = hunt_record.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
