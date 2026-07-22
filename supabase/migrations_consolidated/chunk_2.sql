-- 2. BONUS HUNTS + BONUS HUNT ITEMS (final state)
--    Base: 20251024091611  |  buy_cost -> payment_amount (20251024092957)
--    Final totals trigger:  20260404000001 (lock initial_break_even)
--    Multiplier trigger:    20260403222441
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS bonus_hunt_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS bonus_hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bonus Hunt',
  status text NOT NULL DEFAULT 'active',
  total_invested decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  current_break_even numeric DEFAULT 0,
  initial_break_even numeric DEFAULT 0,
  manual_investment boolean DEFAULT false,
  profit_loss decimal(12,2) DEFAULT 0,
  bonus_count integer DEFAULT 0,
  opened_count integer DEFAULT 0,
  streamer_name text,
  brand_logo_id uuid REFERENCES brand_logos(id) ON DELETE SET NULL,
  hunt_number integer DEFAULT nextval('bonus_hunt_number_seq'),
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('active', 'opening', 'completed')),
  CONSTRAINT bonus_hunts_hunt_number_key UNIQUE (hunt_number)
);

CREATE TABLE IF NOT EXISTS bonus_hunt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id uuid NOT NULL REFERENCES bonus_hunts(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES slots(id) ON DELETE SET NULL,
  slot_name text DEFAULT '',
  slot_image_url text,
  bet_amount decimal(10,2) DEFAULT 0,
  payment_amount decimal(12,2),
  result_amount decimal(12,2),
  multiplier decimal(10,2),
  is_super_bonus boolean DEFAULT false,
  is_extreme_bonus boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  order_index integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_item_status CHECK (status IN ('pending', 'opened'))
);

CREATE INDEX IF NOT EXISTS idx_bonus_hunts_status ON bonus_hunts(status);
CREATE INDEX IF NOT EXISTS idx_bonus_hunts_created ON bonus_hunts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_hunt_id ON bonus_hunt_items(hunt_id);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_order ON bonus_hunt_items(hunt_id, order_index);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_status ON bonus_hunt_items(status);

ALTER TABLE bonus_hunts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_hunt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view bonus hunts" ON bonus_hunts;
CREATE POLICY "Anyone can view bonus hunts" ON bonus_hunts FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert bonus hunts" ON bonus_hunts;
CREATE POLICY "Anyone can insert bonus hunts" ON bonus_hunts FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update bonus hunts" ON bonus_hunts;
CREATE POLICY "Anyone can update bonus hunts" ON bonus_hunts FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete bonus hunts" ON bonus_hunts;
CREATE POLICY "Anyone can delete bonus hunts" ON bonus_hunts FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view bonus hunt items" ON bonus_hunt_items;
CREATE POLICY "Anyone can view bonus hunt items" ON bonus_hunt_items FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert bonus hunt items" ON bonus_hunt_items;
CREATE POLICY "Anyone can insert bonus hunt items" ON bonus_hunt_items FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update bonus hunt items" ON bonus_hunt_items;
CREATE POLICY "Anyone can update bonus hunt items" ON bonus_hunt_items FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete bonus hunt items" ON bonus_hunt_items;
CREATE POLICY "Anyone can delete bonus hunt items" ON bonus_hunt_items FOR DELETE TO public USING (true);

-- FINAL totals trigger (locks initial_break_even once status leaves 'active')
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
  SELECT manual_investment, status, initial_break_even
  INTO current_hunt
  FROM bonus_hunts
  WHERE id = COALESCE(NEW.hunt_id, OLD.hunt_id);

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

  -- Only recalculate initial_break_even while status = 'active'
  IF current_hunt.status = 'active' THEN
    IF v_total_payment > 0 THEN
      IF current_hunt.manual_investment THEN
        v_initial_break_even := hunt_record.total_invested / v_total_payment;
      ELSE
        v_initial_break_even := v_total_payment / v_total_payment;
      END IF;
    ELSE
      v_initial_break_even := 0;
    END IF;
  ELSE
    v_initial_break_even := current_hunt.initial_break_even;
  END IF;

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

DROP TRIGGER IF EXISTS trigger_update_hunt_on_insert ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_insert
  AFTER INSERT ON bonus_hunt_items
  FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();

DROP TRIGGER IF EXISTS trigger_update_hunt_on_update ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_update
  AFTER UPDATE ON bonus_hunt_items
  FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();

DROP TRIGGER IF EXISTS trigger_update_hunt_on_delete ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_delete
  AFTER DELETE ON bonus_hunt_items
  FOR EACH ROW EXECUTE FUNCTION update_bonus_hunt_totals();

-- FINAL item multiplier trigger (payment_amount based)
CREATE OR REPLACE FUNCTION calculate_bonus_hunt_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_amount IS NOT NULL THEN
    NEW.result_amount := NEW.payment_amount;
    IF NEW.bet_amount > 0 THEN
      NEW.multiplier := NEW.payment_amount / NEW.bet_amount;
    ELSE
      NEW.multiplier := 0;
    END IF;
    NEW.status := 'opened';
    NEW.opened_at := COALESCE(NEW.opened_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_hunt_item_multiplier ON bonus_hunt_items;
CREATE TRIGGER trigger_calculate_hunt_item_multiplier
  BEFORE INSERT OR UPDATE ON bonus_hunt_items
  FOR EACH ROW EXECUTE FUNCTION calculate_bonus_hunt_item_multiplier();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bonus_hunts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunts; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bonus_hunt_items') THEN ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunt_items; END IF; END $$;


-- ============================================================================
