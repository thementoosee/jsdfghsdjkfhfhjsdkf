/*
  # Create Brand Logos Storage System

  ## Overview
  Creates a table to store brand logo information for use in stream overlays.

  ## New Tables
  
  ### `brand_logos`
  - `id` (uuid, primary key) - Unique identifier for each brand logo
  - `name` (text, not null) - Display name of the brand
  - `logo_url` (text, not null) - URL or data URI of the logo image
  - `is_active` (boolean, default false) - Whether this brand is currently selected
  - `created_at` (timestamptz) - When the brand was added
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on brand_logos table
  - Allow public read access for overlay viewers
  - Allow public write access for brand management

  ## Notes
  - Users can upload multiple brand logos
  - Only one brand can be active at a time
  - Logos stored as data URIs or external URLs
*/

-- Create brand_logos table
CREATE TABLE IF NOT EXISTS brand_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE brand_logos ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Anyone can view brand logos"
  ON brand_logos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert brand logos"
  ON brand_logos FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update brand logos"
  ON brand_logos FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete brand logos"
  ON brand_logos FOR DELETE
  TO anon, authenticated
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE brand_logos;

-- Create function to ensure only one active brand
CREATE OR REPLACE FUNCTION ensure_single_active_brand()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE brand_logos 
    SET is_active = false, updated_at = now()
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS ensure_single_active_brand_trigger ON brand_logos;
CREATE TRIGGER ensure_single_active_brand_trigger
  BEFORE INSERT OR UPDATE ON brand_logos
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION ensure_single_active_brand();
