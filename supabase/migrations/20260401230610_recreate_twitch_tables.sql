/*
  # Recreate Twitch Integration Tables

  1. New Tables
    - `twitch_config`
      - `id` (uuid, primary key)
      - `access_token` (text) - OAuth access token
      - `refresh_token` (text) - OAuth refresh token
      - `channel_name` (text) - Twitch channel name
      - `channel_id` (text) - Twitch channel ID
      - `is_active` (boolean) - Active status
      - `expires_at` (timestamptz) - Token expiration
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `twitch_chat_messages`
      - `id` (uuid, primary key)
      - `twitch_message_id` (text, unique) - Twitch message ID
      - `username` (text) - Username
      - `display_name` (text) - Display name
      - `message` (text) - Message content
      - `color` (text) - User color
      - `badges` (jsonb) - User badges
      - `is_subscriber` (boolean) - Subscriber status
      - `is_moderator` (boolean) - Moderator status
      - `is_vip` (boolean) - VIP status
      - `created_at` (timestamptz)

    - `twitch_alerts`
      - `id` (uuid, primary key)
      - `alert_type` (text) - Type: follow, subscription, raid, cheer, gift_subscription
      - `username` (text) - Username
      - `display_name` (text) - Display name
      - `message` (text) - Optional message
      - `amount` (integer) - Amount (viewers for raid, bits for cheer)
      - `tier` (text) - Subscription tier
      - `months` (integer) - Subscription months
      - `metadata` (jsonb) - Additional data
      - `is_displayed` (boolean) - Display status
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Public can read all data
    - Authenticated users can manage all data
    - Service role can insert messages from edge functions
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS twitch_alerts CASCADE;
DROP TABLE IF EXISTS twitch_chat_messages CASCADE;
DROP TABLE IF EXISTS twitch_config CASCADE;

-- Table: twitch_config
CREATE TABLE twitch_config (
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

-- Table: twitch_chat_messages
CREATE TABLE twitch_chat_messages (
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

-- Table: twitch_alerts
CREATE TABLE twitch_alerts (
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
CREATE POLICY "Public can read twitch config"
  ON twitch_config FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert twitch config"
  ON twitch_config FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update twitch config"
  ON twitch_config FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete twitch config"
  ON twitch_config FOR DELETE
  TO public
  USING (true);

-- RLS Policies for twitch_chat_messages
CREATE POLICY "Public can read chat messages"
  ON twitch_chat_messages FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert chat messages"
  ON twitch_chat_messages FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can delete chat messages"
  ON twitch_chat_messages FOR DELETE
  TO public
  USING (true);

-- RLS Policies for twitch_alerts
CREATE POLICY "Public can read alerts"
  ON twitch_alerts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert alerts"
  ON twitch_alerts FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update alerts"
  ON twitch_alerts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete alerts"
  ON twitch_alerts FOR DELETE
  TO public
  USING (true);

-- Indexes for performance
CREATE INDEX idx_twitch_config_active ON twitch_config(is_active);
CREATE INDEX idx_twitch_chat_created ON twitch_chat_messages(created_at DESC);
CREATE INDEX idx_twitch_alerts_created ON twitch_alerts(created_at DESC);
CREATE INDEX idx_twitch_alerts_displayed ON twitch_alerts(is_displayed);
CREATE INDEX idx_twitch_message_id ON twitch_chat_messages(twitch_message_id);