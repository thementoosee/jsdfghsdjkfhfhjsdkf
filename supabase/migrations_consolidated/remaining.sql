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

-- 4. CHILL SESSIONS + CHILL BONUSES
--    Source: 20260326223648 (recreate) + 20251027012418 (realtime)
-- ============================================================================

CREATE TABLE IF NOT EXISTS chill_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  streamer_name text,
  brand_logo_id uuid REFERENCES brand_logos(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  total_bonuses integer DEFAULT 0,
  total_bet decimal(10,2) DEFAULT 0,
  total_won decimal(10,2) DEFAULT 0,
  max_win decimal(10,2) DEFAULT 0,
  max_multiplier decimal(10,2) DEFAULT 0,
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chill_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chill_sessions(id) ON DELETE CASCADE,
  bet_amount decimal(10,2) NOT NULL,
  win_amount decimal(10,2) NOT NULL,
  multiplier decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chill_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view chill sessions" ON chill_sessions;
CREATE POLICY "Anyone can view chill sessions" ON chill_sessions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert chill sessions" ON chill_sessions;
CREATE POLICY "Anyone can insert chill sessions" ON chill_sessions FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update chill sessions" ON chill_sessions;
CREATE POLICY "Anyone can update chill sessions" ON chill_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete chill sessions" ON chill_sessions;
CREATE POLICY "Anyone can delete chill sessions" ON chill_sessions FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view chill bonuses" ON chill_bonuses;
CREATE POLICY "Anyone can view chill bonuses" ON chill_bonuses FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert chill bonuses" ON chill_bonuses;
CREATE POLICY "Anyone can insert chill bonuses" ON chill_bonuses FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update chill bonuses" ON chill_bonuses;
CREATE POLICY "Anyone can update chill bonuses" ON chill_bonuses FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete chill bonuses" ON chill_bonuses;
CREATE POLICY "Anyone can delete chill bonuses" ON chill_bonuses FOR DELETE TO public USING (true);

CREATE OR REPLACE FUNCTION update_chill_session_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  UPDATE chill_sessions
  SET
    total_bonuses = (SELECT COUNT(*) FROM chill_bonuses WHERE session_id = v_session_id),
    total_bet = (SELECT COALESCE(SUM(bet_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    total_won = (SELECT COALESCE(SUM(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    max_win = (SELECT COALESCE(MAX(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    max_multiplier = (SELECT COALESCE(MAX(multiplier), 0) FROM chill_bonuses WHERE session_id = v_session_id),
    updated_at = now()
  WHERE id = v_session_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_session_stats_on_bonus_insert ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_insert
  AFTER INSERT ON chill_bonuses
  FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();

DROP TRIGGER IF EXISTS update_session_stats_on_bonus_delete ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_delete
  AFTER DELETE ON chill_bonuses
  FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();

DROP TRIGGER IF EXISTS update_session_stats_on_bonus_update ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_update
  AFTER UPDATE ON chill_bonuses
  FOR EACH ROW EXECUTE FUNCTION update_chill_session_stats();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chill_sessions') THEN ALTER PUBLICATION supabase_realtime ADD TABLE chill_sessions; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chill_bonuses') THEN ALTER PUBLICATION supabase_realtime ADD TABLE chill_bonuses; END IF; END $$;


-- ============================================================================

-- 5. FEVER CHAMPIONS LEAGUE SYSTEM
--    Source: 20260327152539 (v2) + 20260327152551 (realtime)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fever_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tournament_number integer,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  current_phase text NOT NULL DEFAULT 'group_stage' CHECK (current_phase IN ('group_stage', 'knockout')),
  show_on_main_overlay boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fever_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_name text NOT NULL CHECK (group_name IN ('A', 'B', 'C', 'D')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tournament_id, group_name)
);

CREATE TABLE IF NOT EXISTS fever_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  viewer_name text NOT NULL,
  slot_name text NOT NULL DEFAULT '',
  slot_image text DEFAULT '',
  points integer NOT NULL DEFAULT 0,
  spins_count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fever_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  multiplier numeric(10,2) NOT NULL DEFAULT 0,
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0 AND points_earned <= 3),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fever_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES fever_groups(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  participant1_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_points integer NOT NULL DEFAULT 0,
  participant2_points integer NOT NULL DEFAULT 0,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fever_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES fever_tournaments(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('quarter_finals', 'semi_finals', 'final')),
  match_number integer NOT NULL,
  participant1_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant2_id uuid REFERENCES fever_participants(id) ON DELETE CASCADE,
  participant1_bonus_result numeric(10,2) DEFAULT 0,
  participant1_bonus2_result numeric(10,2) DEFAULT 0,
  participant2_bonus_result numeric(10,2) DEFAULT 0,
  participant2_bonus2_result numeric(10,2) DEFAULT 0,
  winner_id uuid REFERENCES fever_participants(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fever_groups_tournament ON fever_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_tournament ON fever_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_participants_group ON fever_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_participant ON fever_spins(participant_id);
CREATE INDEX IF NOT EXISTS idx_fever_spins_tournament ON fever_spins(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_tournament ON fever_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fever_matches_group ON fever_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_fever_playoff_matches_tournament ON fever_playoff_matches(tournament_id);

CREATE OR REPLACE FUNCTION set_fever_tournament_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tournament_number IS NULL THEN
    SELECT COALESCE(MAX(tournament_number), 0) + 1
    INTO NEW.tournament_number
    FROM fever_tournaments;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tournament_number_before_insert ON fever_tournaments;
CREATE TRIGGER set_tournament_number_before_insert
  BEFORE INSERT ON fever_tournaments
  FOR EACH ROW EXECUTE FUNCTION set_fever_tournament_number();

CREATE OR REPLACE FUNCTION calculate_fever_points(bonus1_result numeric, bonus2_result numeric)
RETURNS integer AS $$
DECLARE
  avg_result numeric;
BEGIN
  avg_result := (bonus1_result + bonus2_result) / 2;
  IF avg_result >= 10000 THEN
    RETURN 3;
  ELSIF avg_result >= 5000 THEN
    RETURN 2;
  ELSIF avg_result >= 2501 THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION update_fever_match_points()
RETURNS TRIGGER AS $$
BEGIN
  NEW.participant1_points := calculate_fever_points(
    COALESCE(NEW.participant1_bonus_result, 0),
    COALESCE(NEW.participant1_bonus2_result, 0)
  );
  NEW.participant2_points := calculate_fever_points(
    COALESCE(NEW.participant2_bonus_result, 0),
    COALESCE(NEW.participant2_bonus2_result, 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_match_points ON fever_matches;
CREATE TRIGGER calculate_match_points
  BEFORE INSERT OR UPDATE ON fever_matches
  FOR EACH ROW EXECUTE FUNCTION update_fever_match_points();

CREATE OR REPLACE FUNCTION update_fever_participant_rankings()
RETURNS TRIGGER AS $$
DECLARE
  affected_group_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_group_id := OLD.group_id;
  ELSE
    affected_group_id := NEW.group_id;
  END IF;

  WITH match_results AS (
    SELECT participant_id, SUM(points) as total_points
    FROM (
      SELECT participant1_id as participant_id, participant1_points as points
      FROM fever_matches WHERE group_id = affected_group_id
      UNION ALL
      SELECT participant2_id as participant_id, participant2_points as points
      FROM fever_matches WHERE group_id = affected_group_id
    ) combined
    GROUP BY participant_id
  ),
  ranked AS (
    SELECT
      p.id,
      COALESCE(mr.total_points, 0) as points,
      ROW_NUMBER() OVER (ORDER BY COALESCE(mr.total_points, 0) DESC) as new_position
    FROM fever_participants p
    LEFT JOIN match_results mr ON p.id = mr.participant_id
    WHERE p.group_id = affected_group_id
  )
  UPDATE fever_participants p
  SET points = ranked.points,
      position = ranked.new_position::integer,
      updated_at = now()
  FROM ranked
  WHERE p.id = ranked.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_update_rankings_after_match_change ON fever_matches;
CREATE TRIGGER auto_update_rankings_after_match_change
  AFTER INSERT OR UPDATE OR DELETE ON fever_matches
  FOR EACH ROW EXECUTE FUNCTION update_fever_participant_rankings();

CREATE OR REPLACE FUNCTION advance_playoff_winners()
RETURNS TRIGGER AS $$
DECLARE
  p1_avg numeric;
  p2_avg numeric;
  winner_participant_id uuid;
  next_stage text;
  next_match_number integer;
BEGIN
  IF NEW.participant1_id IS NULL OR NEW.participant2_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.participant1_bonus_result > 0 AND NEW.participant2_bonus_result > 0 THEN
    p1_avg := (NEW.participant1_bonus_result + NEW.participant1_bonus2_result) / 2;
    p2_avg := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2;

    IF p1_avg > p2_avg THEN
      winner_participant_id := NEW.participant1_id;
    ELSIF p2_avg > p1_avg THEN
      winner_participant_id := NEW.participant2_id;
    ELSE
      RETURN NEW;
    END IF;

    UPDATE fever_playoff_matches
    SET winner_id = winner_participant_id
    WHERE id = NEW.id;

    IF NEW.stage = 'quarter_finals' THEN
      next_stage := 'semi_finals';
      next_match_number := CASE WHEN NEW.match_number <= 2 THEN 1 ELSE 2 END;

      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id
        AND stage = next_stage
        AND match_number = next_match_number
        AND participant1_id IS NULL;

      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id
          AND stage = next_stage
          AND match_number = next_match_number;
      END IF;

    ELSIF NEW.stage = 'semi_finals' THEN
      next_stage := 'final';

      UPDATE fever_playoff_matches
      SET participant1_id = winner_participant_id
      WHERE tournament_id = NEW.tournament_id
        AND stage = next_stage
        AND participant1_id IS NULL;

      IF NOT FOUND THEN
        UPDATE fever_playoff_matches
        SET participant2_id = winner_participant_id
        WHERE tournament_id = NEW.tournament_id
          AND stage = next_stage;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_advance_playoff_winners ON fever_playoff_matches;
CREATE TRIGGER trigger_advance_playoff_winners
  AFTER UPDATE ON fever_playoff_matches
  FOR EACH ROW
  WHEN (OLD.participant1_bonus_result IS DISTINCT FROM NEW.participant1_bonus_result
     OR OLD.participant2_bonus_result IS DISTINCT FROM NEW.participant2_bonus_result)
  EXECUTE FUNCTION advance_playoff_winners();

ALTER TABLE fever_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fever_playoff_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view tournaments" ON fever_tournaments;
CREATE POLICY "Public can view tournaments" ON fever_tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert tournaments" ON fever_tournaments;
CREATE POLICY "Public can insert tournaments" ON fever_tournaments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update tournaments" ON fever_tournaments;
CREATE POLICY "Public can update tournaments" ON fever_tournaments FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete tournaments" ON fever_tournaments;
CREATE POLICY "Public can delete tournaments" ON fever_tournaments FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can view groups" ON fever_groups;
CREATE POLICY "Public can view groups" ON fever_groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert groups" ON fever_groups;
CREATE POLICY "Public can insert groups" ON fever_groups FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update groups" ON fever_groups;
CREATE POLICY "Public can update groups" ON fever_groups FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete groups" ON fever_groups;
CREATE POLICY "Public can delete groups" ON fever_groups FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can view participants" ON fever_participants;
CREATE POLICY "Public can view participants" ON fever_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert participants" ON fever_participants;
CREATE POLICY "Public can insert participants" ON fever_participants FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update participants" ON fever_participants;
CREATE POLICY "Public can update participants" ON fever_participants FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete participants" ON fever_participants;
CREATE POLICY "Public can delete participants" ON fever_participants FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can view spins" ON fever_spins;
CREATE POLICY "Public can view spins" ON fever_spins FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert spins" ON fever_spins;
CREATE POLICY "Public can insert spins" ON fever_spins FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update spins" ON fever_spins;
CREATE POLICY "Public can update spins" ON fever_spins FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete spins" ON fever_spins;
CREATE POLICY "Public can delete spins" ON fever_spins FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can view matches" ON fever_matches;
CREATE POLICY "Public can view matches" ON fever_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert matches" ON fever_matches;
CREATE POLICY "Public can insert matches" ON fever_matches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update matches" ON fever_matches;
CREATE POLICY "Public can update matches" ON fever_matches FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete matches" ON fever_matches;
CREATE POLICY "Public can delete matches" ON fever_matches FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can view playoff matches" ON fever_playoff_matches;
CREATE POLICY "Public can view playoff matches" ON fever_playoff_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert playoff matches" ON fever_playoff_matches;
CREATE POLICY "Public can insert playoff matches" ON fever_playoff_matches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update playoff matches" ON fever_playoff_matches;
CREATE POLICY "Public can update playoff matches" ON fever_playoff_matches FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete playoff matches" ON fever_playoff_matches;
CREATE POLICY "Public can delete playoff matches" ON fever_playoff_matches FOR DELETE USING (true);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_tournaments') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_tournaments; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_groups') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_groups; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_participants') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_participants; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_spins') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_spins; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_matches') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_matches; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fever_playoff_matches') THEN ALTER PUBLICATION supabase_realtime ADD TABLE fever_playoff_matches; END IF; END $$;


-- ============================================================================

-- 6. TWITCH INTEGRATION
--    Source: 20260401230610 (recreate) + 20260402011142 (event_id unique)
--            + 20260401230947 (realtime)
-- ============================================================================

CREATE TABLE IF NOT EXISTS twitch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text,
  channel_name text NOT NULL,
  channel_id text NOT NULL,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS twitch_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twitch_message_id text UNIQUE,
  username text NOT NULL,
  display_name text NOT NULL,
  message text NOT NULL,
  color text DEFAULT '#FFFFFF',
  badges jsonb DEFAULT '[]'::jsonb,
  is_subscriber boolean DEFAULT false,
  is_moderator boolean DEFAULT false,
  is_vip boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS twitch_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  alert_type text NOT NULL CHECK (alert_type IN ('follow', 'subscription', 'raid', 'cheer', 'gift_subscription')),
  username text NOT NULL,
  display_name text NOT NULL,
  message text,
  amount integer DEFAULT 0,
  tier text,
  months integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_displayed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE twitch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read twitch config" ON twitch_config;
CREATE POLICY "Public can read twitch config" ON twitch_config FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public can insert twitch config" ON twitch_config;
CREATE POLICY "Public can insert twitch config" ON twitch_config FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update twitch config" ON twitch_config;
CREATE POLICY "Public can update twitch config" ON twitch_config FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete twitch config" ON twitch_config;
CREATE POLICY "Public can delete twitch config" ON twitch_config FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Public can read chat messages" ON twitch_chat_messages;
CREATE POLICY "Public can read chat messages" ON twitch_chat_messages FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public can insert chat messages" ON twitch_chat_messages;
CREATE POLICY "Public can insert chat messages" ON twitch_chat_messages FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete chat messages" ON twitch_chat_messages;
CREATE POLICY "Public can delete chat messages" ON twitch_chat_messages FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Public can read alerts" ON twitch_alerts;
CREATE POLICY "Public can read alerts" ON twitch_alerts FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public can insert alerts" ON twitch_alerts;
CREATE POLICY "Public can insert alerts" ON twitch_alerts FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update alerts" ON twitch_alerts;
CREATE POLICY "Public can update alerts" ON twitch_alerts FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can delete alerts" ON twitch_alerts;
CREATE POLICY "Public can delete alerts" ON twitch_alerts FOR DELETE TO public USING (true);

CREATE INDEX IF NOT EXISTS idx_twitch_config_active ON twitch_config(is_active);
CREATE INDEX IF NOT EXISTS idx_twitch_chat_created ON twitch_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitch_alerts_created ON twitch_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitch_alerts_displayed ON twitch_alerts(is_displayed);
CREATE INDEX IF NOT EXISTS idx_twitch_message_id ON twitch_chat_messages(twitch_message_id);

DROP INDEX IF EXISTS twitch_alerts_event_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS twitch_alerts_event_id_unique
  ON twitch_alerts(event_id) WHERE event_id IS NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='twitch_chat_messages') THEN ALTER PUBLICATION supabase_realtime ADD TABLE twitch_chat_messages; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='twitch_alerts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE twitch_alerts; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='twitch_config') THEN ALTER PUBLICATION supabase_realtime ADD TABLE twitch_config; END IF; END $$;


-- ============================================================================

-- 7. STREAMELEMENTS INTEGRATION
--    config (locked down) + events + lock + copy-to-alert trigger + realtime
-- ============================================================================

-- Config table. Final state is LOCKED DOWN: RLS on, no anon/authenticated
-- policies, privileges revoked (only service_role / edge functions may use it).
CREATE TABLE IF NOT EXISTS streamelements_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jwt_token text,
  account_id text,
  channel_name text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_config ENABLE ROW LEVEL SECURITY;

-- Lockdown: drop any public policies and revoke access from client roles.
DROP POLICY IF EXISTS "Allow public read access to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public insert to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public update to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public delete from streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "StreamElements config is readable by anyone" ON streamelements_config;
DROP POLICY IF EXISTS "StreamElements config is writable by anyone" ON streamelements_config;
DROP POLICY IF EXISTS "StreamElements config is updatable by anyone" ON streamelements_config;
DROP POLICY IF EXISTS "StreamElements config is deletable by anyone" ON streamelements_config;

REVOKE ALL ON TABLE streamelements_config FROM anon;
REVOKE ALL ON TABLE streamelements_config FROM authenticated;

-- Events table (public read/insert/delete for overlays & edge functions).
CREATE TABLE IF NOT EXISTS streamelements_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  event_type text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  message text,
  amount integer DEFAULT 0,
  tier text,
  months integer DEFAULT 0,
  gifted boolean DEFAULT false,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to streamelements_events" ON streamelements_events;
CREATE POLICY "Allow public read access to streamelements_events" ON streamelements_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert access to streamelements_events" ON streamelements_events;
CREATE POLICY "Allow public insert access to streamelements_events" ON streamelements_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete access to streamelements_events" ON streamelements_events;
CREATE POLICY "Allow public delete access to streamelements_events" ON streamelements_events FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_streamelements_events_type ON streamelements_events(event_type);
CREATE INDEX IF NOT EXISTS idx_streamelements_events_created ON streamelements_events(created_at DESC);

DROP INDEX IF EXISTS streamelements_events_event_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS streamelements_events_event_id_unique
  ON streamelements_events(event_id) WHERE event_id IS NOT NULL;

-- Lock table: ensures only ONE edge-function instance runs at a time.
CREATE TABLE IF NOT EXISTS streamelements_lock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_locked boolean DEFAULT false,
  locked_at timestamptz,
  instance_id text,
  last_heartbeat timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read lock status" ON streamelements_lock;
CREATE POLICY "Anyone can read lock status" ON streamelements_lock FOR SELECT TO public USING (true);

-- FINAL copy trigger: SE events -> twitch_alerts (dedup via event_id).
CREATE OR REPLACE FUNCTION copy_se_event_to_alert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO twitch_alerts (
    event_id, alert_type, username, display_name, message, amount, tier, months
  ) VALUES (
    NEW.event_id,
    CASE
      WHEN NEW.event_type = 'follower' THEN 'follow'
      WHEN NEW.event_type = 'subscriber' THEN 'subscription'
      ELSE NEW.event_type
    END,
    NEW.username, NEW.display_name, NEW.message, NEW.amount, NEW.tier, NEW.months
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_streamelements_event_insert ON streamelements_events;
CREATE TRIGGER on_streamelements_event_insert
  AFTER INSERT ON streamelements_events
  FOR EACH ROW EXECUTE FUNCTION copy_se_event_to_alert();

-- Seed a single lock row (idempotent).
INSERT INTO streamelements_lock (is_locked)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM streamelements_lock);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='streamelements_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE streamelements_events; END IF; END $$;

-- NOTE: pg_cron scheduling (20260407_streamelements_sync_cron.sql) is
-- intentionally SKIPPED here. It requires the pg_cron/http extensions and
-- database-level settings (app.supabase_url, app.service_role_key, etc.)
-- that must be configured out-of-band. Enable it separately once the
-- extensions and settings are in place.


-- ============================================================================

-- 8. GIVEAWAYS + GIVEAWAY PARTICIPANTS
--    Source: 20260327095429 + 20260327095501 (fields) + 20260327095647 (policies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drawing', 'completed')),
  winner_username text,
  total_participants integer DEFAULT 0,
  is_visible boolean DEFAULT false,
  duration_minutes integer DEFAULT 30,
  end_time timestamptz,
  winner_profile_image_url text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS giveaway_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  username text NOT NULL,
  user_id text NOT NULL,
  profile_image_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(giveaway_id, user_id)
);

ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view giveaways" ON giveaways;
CREATE POLICY "Anyone can view giveaways" ON giveaways FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert giveaways" ON giveaways;
CREATE POLICY "Anyone can insert giveaways" ON giveaways FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update giveaways" ON giveaways;
CREATE POLICY "Anyone can update giveaways" ON giveaways FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete giveaways" ON giveaways;
CREATE POLICY "Anyone can delete giveaways" ON giveaways FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view participants" ON giveaway_participants;
CREATE POLICY "Anyone can view participants" ON giveaway_participants FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert participants" ON giveaway_participants;
CREATE POLICY "Anyone can insert participants" ON giveaway_participants FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete participants" ON giveaway_participants;
CREATE POLICY "Anyone can delete participants" ON giveaway_participants FOR DELETE TO public USING (true);

CREATE OR REPLACE FUNCTION update_giveaway_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE giveaways
    SET total_participants = (SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = NEW.giveaway_id)
    WHERE id = NEW.giveaway_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE giveaways
    SET total_participants = (SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = OLD.giveaway_id)
    WHERE id = OLD.giveaway_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS giveaway_participants_count_trigger ON giveaway_participants;
CREATE TRIGGER giveaway_participants_count_trigger
  AFTER INSERT OR DELETE ON giveaway_participants
  FOR EACH ROW EXECUTE FUNCTION update_giveaway_participants_count();

CREATE OR REPLACE FUNCTION set_giveaway_end_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL AND NEW.end_time IS NULL THEN
    NEW.end_time := NEW.created_at + (NEW.duration_minutes || ' minutes')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_giveaway_end_time_trigger ON giveaways;
CREATE TRIGGER set_giveaway_end_time_trigger
  BEFORE INSERT ON giveaways
  FOR EACH ROW EXECUTE FUNCTION set_giveaway_end_time();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='giveaways') THEN ALTER PUBLICATION supabase_realtime ADD TABLE giveaways; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='giveaway_participants') THEN ALTER PUBLICATION supabase_realtime ADD TABLE giveaway_participants; END IF; END $$;


-- ============================================================================

-- 9. TOP SLOTS STATISTICS
--    Source: 20260402000610 + 20260402000646 (realtime) + 20260402000818 (seed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS top_slots_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image text,
  total_bonuses integer DEFAULT 0,
  total_bet numeric DEFAULT 0,
  total_won numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  average_multiplier numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE top_slots_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public read access to top_slots_stats" ON top_slots_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public insert access to top_slots_stats" ON top_slots_stats FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public update access to top_slots_stats" ON top_slots_stats FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete access to top_slots_stats" ON top_slots_stats;
CREATE POLICY "Allow public delete access to top_slots_stats" ON top_slots_stats FOR DELETE USING (true);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='top_slots_stats') THEN ALTER PUBLICATION supabase_realtime ADD TABLE top_slots_stats; END IF; END $$;

-- Seed default rows (only if table empty).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM top_slots_stats LIMIT 1) THEN
    INSERT INTO top_slots_stats (slot_name, slot_image, total_bonuses, total_bet, total_won, profit, average_multiplier) VALUES
    ('Gates of Olympus', '/wVqLzwT_default.png', 25, 500.00, 1250.00, 750.00, 2.50),
    ('Sweet Bonanza', '/wVqLzwT_default.png', 30, 600.00, 1350.00, 750.00, 2.25),
    ('The Dog House', '/wVqLzwT_default.png', 20, 400.00, 920.00, 520.00, 2.30),
    ('Sugar Rush', '/wVqLzwT_default.png', 15, 300.00, 660.00, 360.00, 2.20),
    ('Starlight Princess', '/wVqLzwT_default.png', 18, 360.00, 720.00, 360.00, 2.00);
  END IF;
END $$;

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
