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
