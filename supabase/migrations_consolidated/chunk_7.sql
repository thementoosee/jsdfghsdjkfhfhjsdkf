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
