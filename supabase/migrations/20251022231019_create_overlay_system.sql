/*
  # Casino Stream Overlay Management System

  ## Overview
  Creates the database structure to manage different types of overlays for casino streaming.

  ## New Tables
  
  ### `overlays`
  Stores configuration for each overlay type:
  - `id` (uuid, primary key) - Unique identifier
  - `type` (text) - Type of overlay: 'bar', 'background', 'bonus_hunt', 'bonus_opening', 'chill', 'chatbox'
  - `name` (text) - Display name of the overlay
  - `config` (jsonb) - JSON configuration data (colors, positions, text, etc)
  - `is_active` (boolean) - Whether this overlay is currently active
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  - `user_id` (uuid) - Reference to auth.users

  ## Security
  - Enable RLS on `overlays` table
  - Users can only access their own overlays
  - Policies for SELECT, INSERT, UPDATE, DELETE operations
*/

-- Create overlays table
CREATE TABLE IF NOT EXISTS overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('bar', 'background', 'bonus_hunt', 'bonus_opening', 'chill', 'chatbox')),
  name text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE overlays ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own overlays"
  ON overlays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own overlays"
  ON overlays FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own overlays"
  ON overlays FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own overlays"
  ON overlays FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_overlays_user_id ON overlays(user_id);
CREATE INDEX IF NOT EXISTS idx_overlays_type ON overlays(type);