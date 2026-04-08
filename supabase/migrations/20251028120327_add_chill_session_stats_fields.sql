/*
  # Add Statistics Fields to Chill Sessions

  1. Changes
    - Add `max_win` (decimal) - Maior ganho individual de um bonus
    - Add `max_multiplier` (decimal) - Maior multiplicador alcançado
    - Update triggers to calculate these values automatically
  
  2. Notes
    - Removed bet_amount from sessions as user can play with different bets
    - max_win and max_multiplier are calculated from bonuses
*/

-- Add new fields to chill_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chill_sessions' AND column_name = 'max_win'
  ) THEN
    ALTER TABLE chill_sessions ADD COLUMN max_win decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chill_sessions' AND column_name = 'max_multiplier'
  ) THEN
    ALTER TABLE chill_sessions ADD COLUMN max_multiplier decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Update function to calculate max_win and max_multiplier
CREATE OR REPLACE FUNCTION update_chill_session_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Determine session_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  -- Update all statistics
  UPDATE chill_sessions
  SET 
    total_bonuses = (
      SELECT COUNT(*) FROM chill_bonuses WHERE session_id = v_session_id
    ),
    total_bet = (
      SELECT COALESCE(SUM(bet_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id
    ),
    total_won = (
      SELECT COALESCE(SUM(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id
    ),
    max_win = (
      SELECT COALESCE(MAX(win_amount), 0) FROM chill_bonuses WHERE session_id = v_session_id
    ),
    max_multiplier = (
      SELECT COALESCE(MAX(multiplier), 0) FROM chill_bonuses WHERE session_id = v_session_id
    ),
    updated_at = now()
  WHERE id = v_session_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers
DROP TRIGGER IF EXISTS update_session_stats_on_bonus_insert ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_insert
  AFTER INSERT ON chill_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_chill_session_stats();

DROP TRIGGER IF EXISTS update_session_stats_on_bonus_delete ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_delete
  AFTER DELETE ON chill_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_chill_session_stats();

DROP TRIGGER IF EXISTS update_session_stats_on_bonus_update ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_update
  AFTER UPDATE ON chill_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_chill_session_stats();
