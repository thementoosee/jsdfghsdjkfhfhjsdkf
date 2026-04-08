-- Twitch Integration System
-- Creates tables for Twitch OAuth, chat messages, and alerts (subs, raids, follows)

-- Table: twitch_config
-- Stores Twitch OAuth tokens and channel configuration
CREATE TABLE IF NOT EXISTS twitch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  channel_name text NOT NULL,
  channel_id text NOT NULL,
  is_active boolean DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: twitch_chat_messages
-- Stores chat messages from Twitch
CREATE TABLE IF NOT EXISTS twitch_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  display_name text NOT NULL,
  message text NOT NULL,
  color text,
  badges jsonb DEFAULT '[]'::jsonb,
  is_subscriber boolean DEFAULT false,
  is_moderator boolean DEFAULT false,
  is_vip boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Table: twitch_alerts
-- Stores alerts from Twitch (follows, subs, raids, cheers)
CREATE TABLE IF NOT EXISTS twitch_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Enable RLS
ALTER TABLE twitch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitch_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for twitch_config
CREATE POLICY "Public can read active config"
  ON twitch_config FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated can manage config"
  ON twitch_config FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for twitch_chat_messages
CREATE POLICY "Public can read chat messages"
  ON twitch_chat_messages FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated can insert chat messages"
  ON twitch_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete old messages"
  ON twitch_chat_messages FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for twitch_alerts
CREATE POLICY "Public can read alerts"
  ON twitch_alerts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated can manage alerts"
  ON twitch_alerts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_twitch_config_active ON twitch_config(is_active);
CREATE INDEX IF NOT EXISTS idx_twitch_chat_created ON twitch_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitch_alerts_created ON twitch_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitch_alerts_displayed ON twitch_alerts(is_displayed);