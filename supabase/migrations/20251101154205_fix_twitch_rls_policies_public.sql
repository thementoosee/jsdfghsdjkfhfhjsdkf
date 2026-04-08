-- Fix Twitch RLS policies to allow public access for testing

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated can insert chat messages" ON twitch_chat_messages;
DROP POLICY IF EXISTS "Authenticated can delete old messages" ON twitch_chat_messages;
DROP POLICY IF EXISTS "Authenticated can manage alerts" ON twitch_alerts;
DROP POLICY IF EXISTS "Authenticated can manage config" ON twitch_config;

-- Create new public policies for twitch_chat_messages
CREATE POLICY "Anyone can insert chat messages"
  ON twitch_chat_messages FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can delete chat messages"
  ON twitch_chat_messages FOR DELETE
  TO public
  USING (true);

-- Create new public policies for twitch_alerts
CREATE POLICY "Anyone can insert alerts"
  ON twitch_alerts FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update alerts"
  ON twitch_alerts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete alerts"
  ON twitch_alerts FOR DELETE
  TO public
  USING (true);

-- Create new public policies for twitch_config
CREATE POLICY "Anyone can manage config"
  ON twitch_config FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);