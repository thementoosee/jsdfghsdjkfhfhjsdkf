/*
  # StreamElements Integration System

  1. New Tables
    - `streamelements_config`
      - `id` (uuid, primary key)
      - `jwt_token` (text) - JWT token for WebSocket connection
      - `account_id` (text) - StreamElements account ID
      - `channel_name` (text) - Channel name for display
      - `is_active` (boolean) - Whether this config is active
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `streamelements_events`
      - `id` (uuid, primary key)
      - `event_type` (text) - Type of event (follow, subscriber, tip, etc)
      - `username` (text) - Username of the user
      - `display_name` (text) - Display name
      - `message` (text) - Optional message
      - `amount` (numeric) - Amount for tips/bits
      - `tier` (text) - Subscription tier
      - `months` (integer) - Subscription months
      - `gifted` (boolean) - Is gifted sub
      - `raw_data` (jsonb) - Raw event data
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Public read access for overlays
    - No write restrictions for ease of use

  3. Indexes
    - Index on event_type for filtering
    - Index on created_at for recent events queries
*/

CREATE TABLE IF NOT EXISTS streamelements_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jwt_token text NOT NULL,
  account_id text NOT NULL,
  channel_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS streamelements_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  message text,
  amount numeric DEFAULT 0,
  tier text,
  months integer DEFAULT 0,
  gifted boolean DEFAULT false,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE streamelements_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to streamelements_config"
  ON streamelements_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to streamelements_config"
  ON streamelements_config FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to streamelements_config"
  ON streamelements_config FOR UPDATE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public delete from streamelements_config"
  ON streamelements_config FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to streamelements_events"
  ON streamelements_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to streamelements_events"
  ON streamelements_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public delete from streamelements_events"
  ON streamelements_events FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_streamelements_events_type ON streamelements_events(event_type);
CREATE INDEX IF NOT EXISTS idx_streamelements_events_created ON streamelements_events(created_at DESC);
