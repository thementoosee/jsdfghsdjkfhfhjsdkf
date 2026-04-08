/*
  # Enable Realtime for Chill Session Tables

  1. Changes
    - Enable realtime for chill_sessions table
    - Enable realtime for chill_bonuses table
*/

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chill_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chill_bonuses;
