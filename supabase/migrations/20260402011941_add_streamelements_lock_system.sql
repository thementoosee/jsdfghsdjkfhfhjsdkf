/*
  # Add StreamElements Lock System

  1. New Table
    - `streamelements_lock`
      - Ensures only ONE edge function instance runs at a time
      - Tracks last heartbeat to detect dead connections

  2. Security
    - Public read access to check lock status
    - Service role only can write (edge function)
*/

CREATE TABLE IF NOT EXISTS streamelements_lock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_locked boolean DEFAULT false,
  locked_at timestamptz,
  instance_id text,
  last_heartbeat timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE streamelements_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lock status"
  ON streamelements_lock
  FOR SELECT
  TO public
  USING (true);

INSERT INTO streamelements_lock (is_locked) VALUES (false)
ON CONFLICT DO NOTHING;
