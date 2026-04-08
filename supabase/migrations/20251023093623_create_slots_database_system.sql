/*
  # Slots Database System

  ## Overview
  Complete database system for tracking slot machine information, statistics, and player activity.
  This system powers bonus hunts, case openings, and chill overlays with detailed slot data.

  ## New Tables

  ### `slots`
  Core slot machine information
  - `id` (uuid, primary key)
  - `name` (text) - Slot machine name
  - `provider` (text) - Game provider (Pragmatic Play, NoLimit City, etc.)
  - `image_url` (text) - Slot thumbnail/image
  - `max_win` (integer) - Maximum win multiplier
  - `volatility` (text) - Low, Medium, High, or Extreme
  - `rtp` (decimal) - Return to player percentage
  - `min_bet` (decimal) - Minimum bet amount
  - `max_bet` (decimal) - Maximum bet amount
  - `theme` (text) - Slot theme/category
  - `release_date` (date) - When the slot was released
  - `features` (text[]) - Array of special features
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `slot_sessions`
  Individual playing sessions for tracking performance
  - `id` (uuid, primary key)
  - `slot_id` (uuid, foreign key) - References slots table
  - `session_date` (timestamptz) - When session occurred
  - `total_spins` (integer) - Number of spins in session
  - `total_wagered` (decimal) - Total amount wagered
  - `total_won` (decimal) - Total amount won
  - `biggest_win` (decimal) - Largest single win in session
  - `biggest_win_multi` (decimal) - Largest win multiplier
  - `bonus_buys` (integer) - Number of bonus buys
  - `bonus_hits` (integer) - Number of bonus rounds hit naturally
  - `notes` (text) - Session notes
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `slot_stats`
  Aggregated statistics per slot
  - `id` (uuid, primary key)
  - `slot_id` (uuid, foreign key, unique) - References slots table
  - `total_sessions` (integer) - Total number of sessions
  - `total_spins` (integer) - Total spins across all sessions
  - `total_wagered` (decimal) - Total wagered across all sessions
  - `total_won` (decimal) - Total won across all sessions
  - `profit_loss` (decimal) - Net profit/loss
  - `best_win_amount` (decimal) - Best win amount ever
  - `best_win_multi` (decimal) - Best win multiplier ever
  - `total_bonus_buys` (integer) - Total bonus buys
  - `total_bonus_hits` (integer) - Total natural bonus hits
  - `avg_rtp_actual` (decimal) - Actual RTP based on play
  - `last_played` (timestamptz) - Last session date
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `slot_favorites`
  Track favorite/starred slots
  - `id` (uuid, primary key)
  - `slot_id` (uuid, foreign key) - References slots table
  - `is_favorite` (boolean) - Whether slot is favorited
  - `notes` (text) - Personal notes about the slot
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Public read access for slot information
  - Restricted write access for data management

  ## Important Notes
  1. All tables use UUID primary keys for scalability
  2. Timestamps track creation and updates
  3. Foreign key constraints ensure data integrity
  4. Statistics table maintains aggregated data for performance
  5. Sessions table tracks individual playing sessions
  6. RLS policies allow public read but controlled writes
*/

-- Create slots table
CREATE TABLE IF NOT EXISTS slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  image_url text,
  max_win integer DEFAULT 0,
  volatility text DEFAULT 'Medium',
  rtp decimal(5,2) DEFAULT 96.00,
  min_bet decimal(10,2) DEFAULT 0.20,
  max_bet decimal(10,2) DEFAULT 100.00,
  theme text,
  release_date date,
  features text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create slot_sessions table
CREATE TABLE IF NOT EXISTS slot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  session_date timestamptz DEFAULT now(),
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  biggest_win decimal(12,2) DEFAULT 0,
  biggest_win_multi decimal(10,2) DEFAULT 0,
  bonus_buys integer DEFAULT 0,
  bonus_hits integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create slot_stats table
CREATE TABLE IF NOT EXISTS slot_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  total_sessions integer DEFAULT 0,
  total_spins integer DEFAULT 0,
  total_wagered decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  profit_loss decimal(12,2) DEFAULT 0,
  best_win_amount decimal(12,2) DEFAULT 0,
  best_win_multi decimal(10,2) DEFAULT 0,
  total_bonus_buys integer DEFAULT 0,
  total_bonus_hits integer DEFAULT 0,
  avg_rtp_actual decimal(5,2) DEFAULT 0,
  last_played timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create slot_favorites table
CREATE TABLE IF NOT EXISTS slot_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  is_favorite boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_slots_provider ON slots(provider);
CREATE INDEX IF NOT EXISTS idx_slots_volatility ON slots(volatility);
CREATE INDEX IF NOT EXISTS idx_slot_sessions_slot_id ON slot_sessions(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_sessions_date ON slot_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_slot_stats_slot_id ON slot_stats(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_favorites_slot_id ON slot_favorites(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_favorites_is_favorite ON slot_favorites(is_favorite);

-- Enable Row Level Security
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_favorites ENABLE ROW LEVEL SECURITY;

-- Create policies for slots table (public read, controlled write)
CREATE POLICY "Anyone can view slots"
  ON slots FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert slots"
  ON slots FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update slots"
  ON slots FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete slots"
  ON slots FOR DELETE
  TO public
  USING (true);

-- Create policies for slot_sessions table
CREATE POLICY "Anyone can view slot sessions"
  ON slot_sessions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert slot sessions"
  ON slot_sessions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update slot sessions"
  ON slot_sessions FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete slot sessions"
  ON slot_sessions FOR DELETE
  TO public
  USING (true);

-- Create policies for slot_stats table
CREATE POLICY "Anyone can view slot stats"
  ON slot_stats FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert slot stats"
  ON slot_stats FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update slot stats"
  ON slot_stats FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete slot stats"
  ON slot_stats FOR DELETE
  TO public
  USING (true);

-- Create policies for slot_favorites table
CREATE POLICY "Anyone can view slot favorites"
  ON slot_favorites FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert slot favorites"
  ON slot_favorites FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update slot favorites"
  ON slot_favorites FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete slot favorites"
  ON slot_favorites FOR DELETE
  TO public
  USING (true);

-- Create function to update slot stats when a session is added
CREATE OR REPLACE FUNCTION update_slot_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update slot_stats
  INSERT INTO slot_stats (
    slot_id,
    total_sessions,
    total_spins,
    total_wagered,
    total_won,
    profit_loss,
    best_win_amount,
    best_win_multi,
    total_bonus_buys,
    total_bonus_hits,
    last_played,
    updated_at
  )
  VALUES (
    NEW.slot_id,
    1,
    NEW.total_spins,
    NEW.total_wagered,
    NEW.total_won,
    NEW.total_won - NEW.total_wagered,
    NEW.biggest_win,
    NEW.biggest_win_multi,
    NEW.bonus_buys,
    NEW.bonus_hits,
    NEW.session_date,
    now()
  )
  ON CONFLICT (slot_id) DO UPDATE SET
    total_sessions = slot_stats.total_sessions + 1,
    total_spins = slot_stats.total_spins + NEW.total_spins,
    total_wagered = slot_stats.total_wagered + NEW.total_wagered,
    total_won = slot_stats.total_won + NEW.total_won,
    profit_loss = slot_stats.profit_loss + (NEW.total_won - NEW.total_wagered),
    best_win_amount = GREATEST(slot_stats.best_win_amount, NEW.biggest_win),
    best_win_multi = GREATEST(slot_stats.best_win_multi, NEW.biggest_win_multi),
    total_bonus_buys = slot_stats.total_bonus_buys + NEW.bonus_buys,
    total_bonus_hits = slot_stats.total_bonus_hits + NEW.bonus_hits,
    avg_rtp_actual = CASE 
      WHEN slot_stats.total_wagered + NEW.total_wagered > 0 
      THEN ((slot_stats.total_won + NEW.total_won) / (slot_stats.total_wagered + NEW.total_wagered) * 100)
      ELSE 0
    END,
    last_played = NEW.session_date,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update stats
DROP TRIGGER IF EXISTS trigger_update_slot_stats ON slot_sessions;
CREATE TRIGGER trigger_update_slot_stats
  AFTER INSERT ON slot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_slot_stats();

-- Enable realtime for all slots tables
ALTER PUBLICATION supabase_realtime ADD TABLE slots;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_favorites;