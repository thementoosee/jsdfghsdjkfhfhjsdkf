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
