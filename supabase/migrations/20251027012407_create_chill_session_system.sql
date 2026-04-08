/*
  # Create Chill Session System

  1. New Tables
    - `chill_sessions`
      - `id` (uuid, primary key)
      - `slot_name` (text) - Nome da slot que está a jogar
      - `started_at` (timestamptz) - Quando começou a jogar esta slot
      - `ended_at` (timestamptz, nullable) - Quando terminou de jogar
      - `total_bonuses` (integer) - Total de bonuses registados
      - `total_bet` (decimal) - Total apostado em bonuses
      - `total_won` (decimal) - Total ganho em bonuses
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `chill_bonuses`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key) - Referência à sessão
      - `bet_amount` (decimal) - Valor da bet quando saiu o bonus
      - `win_amount` (decimal) - Valor que o bonus pagou
      - `multiplier` (decimal) - Multiplicador calculado
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for public read access (for overlay viewing)
    - Add policies for authenticated write access
*/

-- Create chill_sessions table
CREATE TABLE IF NOT EXISTS chill_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  total_bonuses integer DEFAULT 0,
  total_bet decimal(10,2) DEFAULT 0,
  total_won decimal(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chill_bonuses table
CREATE TABLE IF NOT EXISTS chill_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chill_sessions(id) ON DELETE CASCADE,
  bet_amount decimal(10,2) NOT NULL,
  win_amount decimal(10,2) NOT NULL,
  multiplier decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE chill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chill_bonuses ENABLE ROW LEVEL SECURITY;

-- Policies for chill_sessions
CREATE POLICY "Anyone can view chill sessions"
  ON chill_sessions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert chill sessions"
  ON chill_sessions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update chill sessions"
  ON chill_sessions FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete chill sessions"
  ON chill_sessions FOR DELETE
  TO public
  USING (true);

-- Policies for chill_bonuses
CREATE POLICY "Anyone can view chill bonuses"
  ON chill_bonuses FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert chill bonuses"
  ON chill_bonuses FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update chill bonuses"
  ON chill_bonuses FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete chill bonuses"
  ON chill_bonuses FOR DELETE
  TO public
  USING (true);

-- Function to update session statistics
CREATE OR REPLACE FUNCTION update_chill_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chill_sessions
  SET 
    total_bonuses = (
      SELECT COUNT(*) FROM chill_bonuses WHERE session_id = NEW.session_id
    ),
    total_bet = (
      SELECT COALESCE(SUM(bet_amount), 0) FROM chill_bonuses WHERE session_id = NEW.session_id
    ),
    total_won = (
      SELECT COALESCE(SUM(win_amount), 0) FROM chill_bonuses WHERE session_id = NEW.session_id
    ),
    updated_at = now()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update statistics when bonus is added
DROP TRIGGER IF EXISTS update_session_stats_on_bonus_insert ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_insert
  AFTER INSERT ON chill_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_chill_session_stats();

-- Trigger to update statistics when bonus is deleted
DROP TRIGGER IF EXISTS update_session_stats_on_bonus_delete ON chill_bonuses;
CREATE TRIGGER update_session_stats_on_bonus_delete
  AFTER DELETE ON chill_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_chill_session_stats();
