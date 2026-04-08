-- Enable realtime for Twitch integration tables

ALTER PUBLICATION supabase_realtime ADD TABLE twitch_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE twitch_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE twitch_config;