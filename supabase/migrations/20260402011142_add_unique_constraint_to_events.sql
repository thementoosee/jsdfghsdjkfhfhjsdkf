/*
  # Add unique constraint to prevent duplicate events

  1. Changes
    - Add event_id column to streamelements_events and twitch_alerts
    - Add unique constraints to prevent duplicate insertions
    - Update trigger to handle conflicts gracefully
    
  2. Purpose
    - Prevent duplicate events when multiple workers are running
    - Ensure only one event per unique occurrence
*/

-- Add event_id column to streamelements_events if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streamelements_events' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE streamelements_events ADD COLUMN event_id TEXT;
  END IF;
END $$;

-- Add event_id column to twitch_alerts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'twitch_alerts' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE twitch_alerts ADD COLUMN event_id TEXT;
  END IF;
END $$;

-- Add unique constraint to streamelements_events
DROP INDEX IF EXISTS streamelements_events_event_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS streamelements_events_event_id_unique 
ON streamelements_events(event_id) 
WHERE event_id IS NOT NULL;

-- Add unique constraint to twitch_alerts
DROP INDEX IF EXISTS twitch_alerts_event_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS twitch_alerts_event_id_unique 
ON twitch_alerts(event_id) 
WHERE event_id IS NOT NULL;

-- Update trigger to include event_id and handle conflicts
CREATE OR REPLACE FUNCTION copy_se_event_to_alert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO twitch_alerts (
    event_id,
    alert_type,
    username,
    display_name,
    message,
    amount,
    tier,
    months
  ) VALUES (
    NEW.event_id,
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
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
