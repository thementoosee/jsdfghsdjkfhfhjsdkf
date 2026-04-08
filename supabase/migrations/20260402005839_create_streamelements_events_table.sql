/*
  # Create StreamElements Events Table

  1. New Tables
    - `streamelements_events`
      - `id` (uuid, primary key)
      - `event_type` (text) - tipo de evento (follower, subscriber, tip, cheer, raid, host)
      - `username` (text) - username do utilizador
      - `display_name` (text) - nome de exibição
      - `message` (text, nullable) - mensagem opcional
      - `amount` (integer) - quantidade (bits, valor, etc)
      - `tier` (text, nullable) - tier da subscrição
      - `months` (integer) - meses de subscrição
      - `gifted` (boolean) - se foi gift sub
      - `raw_data` (jsonb) - dados completos do evento
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `streamelements_events` table
    - Add policies for public read access (for overlays)
    - Add policies for public insert access (for Edge Function)
*/

CREATE TABLE IF NOT EXISTS streamelements_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  message text,
  amount integer DEFAULT 0,
  tier text,
  months integer DEFAULT 0,
  gifted boolean DEFAULT false,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to streamelements_events"
  ON streamelements_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert access to streamelements_events"
  ON streamelements_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to streamelements_events"
  ON streamelements_events
  FOR DELETE
  TO anon, authenticated
  USING (true);
