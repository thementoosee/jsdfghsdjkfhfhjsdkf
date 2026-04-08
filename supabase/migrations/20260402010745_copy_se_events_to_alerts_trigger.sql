/*
  # Copy StreamElements Events to Alerts Trigger

  1. Trigger
    - Automatically copies events from streamelements_events to twitch_alerts
    - Ensures all SE events appear in alerts overlay
    
  2. Purpose
    - When new event is inserted into streamelements_events, it's automatically copied to twitch_alerts
    - Converts SE event types to alert types (follower -> follow, subscriber -> subscription)
*/

CREATE OR REPLACE FUNCTION copy_se_event_to_alert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO twitch_alerts (
    alert_type,
    username,
    display_name,
    message,
    amount,
    tier,
    months
  ) VALUES (
    CASE 
      WHEN NEW.event_type = 'follower' THEN 'follow'
      WHEN NEW.event_type = 'subscriber' THEN 'subscription'
      ELSE NEW.event_type
    END,
    NEW.username,
    NEW.display_name,
    NEW.message,
    NEW.amount,
    NEW.tier,
    NEW.months
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_streamelements_event_insert ON streamelements_events;

CREATE TRIGGER on_streamelements_event_insert
  AFTER INSERT ON streamelements_events
  FOR EACH ROW
  EXECUTE FUNCTION copy_se_event_to_alert();
