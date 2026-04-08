/*
  # Enable Realtime for Twitch Tables

  1. Changes
    - Enable realtime replication for twitch_chat_messages
    - Enable realtime replication for twitch_alerts
    - Enable realtime replication for twitch_config
  
  2. Purpose
    - Allow real-time updates in overlays without refresh
    - Chat messages appear instantly
    - Alerts appear instantly
*/

-- Enable realtime for twitch tables
ALTER PUBLICATION supabase_realtime ADD TABLE twitch_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE twitch_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE twitch_config;