-- 3. BONUS OPENINGS + BONUS OPENING ITEMS (final state)
--    Base: 20251029232608  |  legacy cols: 20260320142321
--    Final totals trigger:  20260401211633 (real-time current_break_even)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS bonus_opening_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS bonus_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  total_investment numeric DEFAULT 0,
  total_payout numeric DEFAULT 0,
  profit_loss numeric DEFAULT 0,
  current_multiplier numeric DEFAULT 0,
  current_break_even numeric DEFAULT 0,
  initial_break_even numeric DEFAULT 0,
  initial_investment numeric DEFAULT 0,
  source_hunt_investment numeric DEFAULT 0,
  streamer_name text DEFAULT '',
  brand_logo_id uuid REFERENCES brand_logos(id),
  opening_number integer DEFAULT nextval('bonus_opening_number_seq'),
  hunt_number integer,
  source_hunt_id uuid REFERENCES bonus_hunts(id) ON DELETE SET NULL,
  source_hunt_number integer,
  source_hunt_date timestamptz,
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bonus_openings_opening_number_key UNIQUE (opening_number)
);

CREATE TABLE IF NOT EXISTS bonus_opening_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_opening_id uuid NOT NULL REFERENCES bonus_openings(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES slots(id),
  slot_name text,
  slot_image text DEFAULT '',
  -- primary columns
  payment numeric DEFAULT 0,
  payout numeric DEFAULT 0,
  multiplier numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'opened')),
  super_bonus boolean DEFAULT false,
  order_index integer DEFAULT 0,
  -- legacy / alias columns kept for backward compatibility
  current_break_even numeric DEFAULT 0,
  current_break_even_multiplier numeric DEFAULT 1,
  payment_amount numeric DEFAULT 0,
  win_amount numeric DEFAULT 0,
  is_super_bonus boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_opening_items_opening_id ON bonus_opening_items(bonus_opening_id);
CREATE INDEX IF NOT EXISTS idx_bonus_opening_items_status ON bonus_opening_items(status);
CREATE INDEX IF NOT EXISTS idx_bonus_openings_status ON bonus_openings(status);

ALTER TABLE bonus_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_opening_items ENABLE ROW LEVEL SECURITY;

-- Public RLS (anon + authenticated via public role), including UPDATE
DROP POLICY IF EXISTS "Public can view bonus openings" ON bonus_openings;
CREATE POLICY "Public can view bonus openings" ON bonus_openings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public can insert bonus openings" ON bonus_openings;
CREATE POLICY "Public can insert bonus openings" ON bonus_openings FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update bonus openings" ON bonus_openings;
CREATE POLICY "Public can update bonus openings" ON bonus_openings FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete bonus openings" ON bonus_openings;
CREATE POLICY "Public can delete bonus openings" ON bonus_openings FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Public can view bonus opening items" ON bonus_opening_items;
CREATE POLICY "Public can view bonus opening items" ON bonus_opening_items FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public can insert bonus opening items" ON bonus_opening_items;
CREATE POLICY "Public can insert bonus opening items" ON bonus_opening_items FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update bonus opening items" ON bonus_opening_items;
CREATE POLICY "Public can update bonus opening items" ON bonus_opening_items FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete bonus opening items" ON bonus_opening_items;
CREATE POLICY "Public can delete bonus opening items" ON bonus_opening_items FOR DELETE TO public USING (true);

-- Auto-increment opening_number (safety net alongside sequence default)
CREATE OR REPLACE FUNCTION set_opening_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opening_number IS NULL THEN
    SELECT COALESCE(MAX(opening_number), 0) + 1
    INTO NEW.opening_number
    FROM bonus_openings;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_opening_number_trigger ON bonus_openings;
CREATE TRIGGER set_opening_number_trigger
  BEFORE INSERT ON bonus_openings
  FOR EACH ROW EXECUTE FUNCTION set_opening_number();

-- Item multiplier trigger
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

DROP TRIGGER IF EXISTS trigger_update_bonus_opening_item_multiplier ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_item_multiplier
  BEFORE INSERT OR UPDATE OF payout, payment ON bonus_opening_items
  FOR EACH ROW EXECUTE FUNCTION update_bonus_opening_item_multiplier();

-- FINAL totals trigger (real-time current_break_even from initial_investment)
CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_initial_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
  v_initial_break_even numeric;
  v_opened_items integer;
  v_total_items integer;
  v_remaining_bet_sum numeric;
  v_amount_needed numeric;
BEGIN
  SELECT initial_investment, initial_break_even
  INTO v_initial_investment, v_initial_break_even
  FROM bonus_openings
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);

  SELECT
    COALESCE(SUM(payout), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'opened')
  INTO v_total_payout, v_total_items, v_opened_items
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);

  v_profit_loss := v_total_payout - v_initial_investment;

  IF v_initial_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_initial_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;

  IF v_opened_items = 0 THEN
    v_current_break_even := v_initial_break_even;
  ELSIF v_opened_items = v_total_items THEN
    v_current_break_even := 0;
  ELSE
    SELECT COALESCE(SUM(payment), 0)
    INTO v_remaining_bet_sum
    FROM bonus_opening_items
    WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id)
      AND status = 'pending';

    IF v_remaining_bet_sum > 0 THEN
      v_amount_needed := GREATEST(0, v_initial_investment - v_total_payout);
      v_current_break_even := v_amount_needed / v_remaining_bet_sum;
    ELSE
      v_current_break_even := 0;
    END IF;
  END IF;

  UPDATE bonus_openings SET
    total_investment = v_initial_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even,
    updated_at = now()
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bonus_opening_totals ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_totals
  AFTER INSERT OR UPDATE OR DELETE ON bonus_opening_items
  FOR EACH ROW EXECUTE FUNCTION update_bonus_opening_totals();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bonus_openings') THEN ALTER PUBLICATION supabase_realtime ADD TABLE bonus_openings; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bonus_opening_items') THEN ALTER PUBLICATION supabase_realtime ADD TABLE bonus_opening_items; END IF; END $$;


-- ============================================================================
