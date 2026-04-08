/*
  # Add duration field to giveaways table

  1. Changes
    - Add `duration_minutes` (integer) - Duração do sorteio em minutos
    - Add `end_time` (timestamptz) - Hora de término calculada automaticamente
    
  2. Function
    - Auto-calculate end_time when giveaway is created based on duration_minutes
*/

-- Add duration_minutes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN duration_minutes integer DEFAULT 30;
  END IF;
END $$;

-- Add end_time field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'giveaways' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE giveaways ADD COLUMN end_time timestamptz;
  END IF;
END $$;

-- Function to set end_time on insert
CREATE OR REPLACE FUNCTION set_giveaway_end_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL AND NEW.end_time IS NULL THEN
    NEW.end_time := NEW.created_at + (NEW.duration_minutes || ' minutes')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set end_time
DROP TRIGGER IF EXISTS set_giveaway_end_time_trigger ON giveaways;
CREATE TRIGGER set_giveaway_end_time_trigger
BEFORE INSERT ON giveaways
FOR EACH ROW
EXECUTE FUNCTION set_giveaway_end_time();