/*
  ============================================================================
  overlaysfever-v2 — CONSOLIDATED FINAL SCHEMA
  ============================================================================
  This single migration recreates the COMPLETE final schema for
  overlaysfever-v2, EXCEPT the pre-existing base tables:
      overlays, brand_logos, casinos
  (those are assumed to already exist).

  Everything here is idempotent:
    - CREATE TABLE IF NOT EXISTS
    - CREATE SEQUENCE IF NOT EXISTS
    - CREATE INDEX IF NOT EXISTS
    - DROP POLICY IF EXISTS before every CREATE POLICY
    - ALTER PUBLICATION ... ADD TABLE guarded by pg_publication_tables checks
    - CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS + CREATE TRIGGER

  Domains (in order):
    1. slots family (slots, slot_sessions, slot_stats, slot_favorites)
    2. bonus_hunts + bonus_hunt_items
    3. bonus_openings + bonus_opening_items
    4. chill_sessions + chill_bonuses
    5. fever champions league (tournaments/groups/participants/spins/matches/playoffs)
    6. twitch (config/chat_messages/alerts)
    7. streamelements (config/events/lock)
    8. giveaways + giveaway_participants
    9. top_slots_stats

  NOTE: The historical bulk slots import is intentionally NOT included here.
        The `slots` table can be left empty — the frontend works fine with an
        empty slots catalogue and slots can be added at runtime.
  ============================================================================
*/

-- ============================================================================
-- 0. EXTEND PRE-EXISTING `overlays` TABLE (already created elsewhere)
-- ============================================================================
ALTER TABLE overlays ADD COLUMN IF NOT EXISTS fever_champions_config jsonb DEFAULT '{}'::jsonb;


-- ============================================================================
-- 1. SLOTS FAMILY
--    Source: 20251023093623_create_slots_database_system.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  image_url text,
  max_win integer DEFAULT 0,
  volatility text DEFAULT 'Medium',
  rtp decimal(5,2) DEFAULT 96.00,
  min_bet decimal(10,2) DEFAULT 0.20,
  max_bet decimal(10,2) DEFAULT 100.00,
  theme text,
  release_date date,
  features text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  session_date timestamptz DEFAULT now(),
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  biggest_win decimal(12,2) DEFAULT 0,
  biggest_win_multi decimal(10,2) DEFAULT 0,
  bonus_buys integer DEFAULT 0,
  bonus_hits integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slot_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  total_sessions integer DEFAULT 0,
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  profit_loss decimal(12,2) DEFAULT 0,
  best_win_amount decimal(12,2) DEFAULT 0,
  best_win_multi decimal(10,2) DEFAULT 0,
  total_bonus_buys integer DEFAULT 0,
  total_bonus_hits integer DEFAULT 0,
  avg_rtp_actual decimal(5,2) DEFAULT 0,
  last_played timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slot_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  is_favorite boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slots_provider ON slots(provider);
CREATE INDEX IF NOT EXISTS idx_slots_volatility ON slots(volatility);
CREATE INDEX IF NOT EXISTS idx_slot_sessions_slot_id ON slot_sessions(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_sessions_date ON slot_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_slot_stats_slot_id ON slot_stats(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_favorites_slot_id ON slot_favorites(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_favorites_is_favorite ON slot_favorites(is_favorite);

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view slots" ON slots;
CREATE POLICY "Anyone can view slots" ON slots FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert slots" ON slots;
CREATE POLICY "Anyone can insert slots" ON slots FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update slots" ON slots;
CREATE POLICY "Anyone can update slots" ON slots FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete slots" ON slots;
CREATE POLICY "Anyone can delete slots" ON slots FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view slot sessions" ON slot_sessions;
CREATE POLICY "Anyone can view slot sessions" ON slot_sessions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert slot sessions" ON slot_sessions;
CREATE POLICY "Anyone can insert slot sessions" ON slot_sessions FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update slot sessions" ON slot_sessions;
CREATE POLICY "Anyone can update slot sessions" ON slot_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete slot sessions" ON slot_sessions;
CREATE POLICY "Anyone can delete slot sessions" ON slot_sessions FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view slot stats" ON slot_stats;
CREATE POLICY "Anyone can view slot stats" ON slot_stats FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert slot stats" ON slot_stats;
CREATE POLICY "Anyone can insert slot stats" ON slot_stats FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update slot stats" ON slot_stats;
CREATE POLICY "Anyone can update slot stats" ON slot_stats FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete slot stats" ON slot_stats;
CREATE POLICY "Anyone can delete slot stats" ON slot_stats FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view slot favorites" ON slot_favorites;
CREATE POLICY "Anyone can view slot favorites" ON slot_favorites FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can insert slot favorites" ON slot_favorites;
CREATE POLICY "Anyone can insert slot favorites" ON slot_favorites FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update slot favorites" ON slot_favorites;
CREATE POLICY "Anyone can update slot favorites" ON slot_favorites FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete slot favorites" ON slot_favorites;
CREATE POLICY "Anyone can delete slot favorites" ON slot_favorites FOR DELETE TO public USING (true);

CREATE OR REPLACE FUNCTION update_slot_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO slot_stats (
    slot_id, total_sessions, total_spins, total_wagered, total_won,
    profit_loss, best_win_amount, best_win_multi, total_bonus_buys,
    total_bonus_hits, last_played, updated_at
  )
  VALUES (
    NEW.slot_id, 1, NEW.total_spins, NEW.total_wagered, NEW.total_won,
    NEW.total_won - NEW.total_wagered, NEW.biggest_win, NEW.biggest_win_multi,
    NEW.bonus_buys, NEW.bonus_hits, NEW.session_date, now()
  )
  ON CONFLICT (slot_id) DO UPDATE SET
    total_sessions = slot_stats.total_sessions + 1,
    total_spins = slot_stats.total_spins + NEW.total_spins,
    total_wagered = slot_stats.total_wagered + NEW.total_wagered,
    total_won = slot_stats.total_won + NEW.total_won,
    profit_loss = slot_stats.profit_loss + (NEW.total_won - NEW.total_wagered),
    best_win_amount = GREATEST(slot_stats.best_win_amount, NEW.biggest_win),
    best_win_multi = GREATEST(slot_stats.best_win_multi, NEW.biggest_win_multi),
    total_bonus_buys = slot_stats.total_bonus_buys + NEW.bonus_buys,
    total_bonus_hits = slot_stats.total_bonus_hits + NEW.bonus_hits,
    avg_rtp_actual = CASE
      WHEN slot_stats.total_wagered + NEW.total_wagered > 0
      THEN ((slot_stats.total_won + NEW.total_won) / (slot_stats.total_wagered + NEW.total_wagered) * 100)
      ELSE 0
    END,
    last_played = NEW.session_date,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_slot_stats ON slot_sessions;
CREATE TRIGGER trigger_update_slot_stats
  AFTER INSERT ON slot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_slot_stats();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='slots') THEN ALTER PUBLICATION supabase_realtime ADD TABLE slots; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='slot_sessions') THEN ALTER PUBLICATION supabase_realtime ADD TABLE slot_sessions; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='slot_stats') THEN ALTER PUBLICATION supabase_realtime ADD TABLE slot_stats; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='slot_favorites') THEN ALTER PUBLICATION supabase_realtime ADD TABLE slot_favorites; END IF; END $$;

-- Slots catalogue may remain EMPTY. Historical bulk import is intentionally
-- omitted from this consolidated schema; the frontend works with 0 slots.


-- ============================================================================
