/*
  # Create Top Slots Statistics Table

  1. New Tables
    - `top_slots_stats`
      - `id` (uuid, primary key)
      - `slot_name` (text)
      - `slot_image` (text, nullable)
      - `total_bonuses` (integer) - Total number of bonuses played
      - `total_bet` (numeric) - Total amount bet
      - `total_won` (numeric) - Total amount won
      - `profit` (numeric) - Profit/loss amount
      - `average_multiplier` (numeric) - Average win multiplier
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `top_slots_stats` table
    - Add policy for public read access
    - Add policy for public write access (for statistics updates)
  
  3. Notes
    - This table stores aggregated statistics for the top performing slots
    - Data is calculated from bonus_hunt_items and chill_bonuses
*/

CREATE TABLE IF NOT EXISTS top_slots_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL,
  slot_image text,
  total_bonuses integer DEFAULT 0,
  total_bet numeric DEFAULT 0,
  total_won numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  average_multiplier numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE top_slots_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to top_slots_stats"
  ON top_slots_stats
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to top_slots_stats"
  ON top_slots_stats
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to top_slots_stats"
  ON top_slots_stats
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to top_slots_stats"
  ON top_slots_stats
  FOR DELETE
  USING (true);