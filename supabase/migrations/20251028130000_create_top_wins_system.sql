/*
  # Create Top Wins System

  1. New Tables
    - `top_wins`
      - `id` (uuid, primary key)
      - `slot_name` (text, slot game name)
      - `slot_image_url` (text, image URL of the slot)
      - `win_amount` (numeric, win amount)
      - `bet_amount` (numeric, bet amount)
      - `multiplier` (numeric, win multiplier - calculated)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `top_wins` table
    - Add policy for public read access (for overlay display)
    - Add policy for authenticated users to manage wins

  3. Functions
    - Auto-calculate multiplier on insert/update
*/

-- Create top_wins table
CREATE TABLE IF NOT EXISTS top_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image_url text,
  win_amount numeric NOT NULL DEFAULT 0,
  bet_amount numeric NOT NULL DEFAULT 0,
  multiplier numeric GENERATED ALWAYS AS (
    CASE
      WHEN bet_amount > 0 THEN ROUND(win_amount / bet_amount, 2)
      ELSE 0
    END
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE top_wins ENABLE ROW LEVEL SECURITY;

-- Public read policy for overlay display
CREATE POLICY "Anyone can view top wins"
  ON top_wins
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can create top wins"
  ON top_wins
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update top wins"
  ON top_wins
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete top wins"
  ON top_wins
  FOR DELETE
  TO authenticated
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_top_wins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_top_wins_updated_at
  BEFORE UPDATE ON top_wins
  FOR EACH ROW
  EXECUTE FUNCTION update_top_wins_updated_at();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_top_wins_multiplier ON top_wins(multiplier DESC);
CREATE INDEX IF NOT EXISTS idx_top_wins_created_at ON top_wins(created_at DESC);
