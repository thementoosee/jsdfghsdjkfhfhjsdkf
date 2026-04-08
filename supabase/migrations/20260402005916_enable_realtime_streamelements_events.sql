/*
  # Enable Realtime for StreamElements Events

  1. Changes
    - Enable realtime replication for streamelements_events table
    - This allows the frontend to receive live updates when new events arrive
*/

ALTER PUBLICATION supabase_realtime ADD TABLE streamelements_events;
