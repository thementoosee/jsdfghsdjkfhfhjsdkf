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
