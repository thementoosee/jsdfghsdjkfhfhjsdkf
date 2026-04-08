/*
  # Add brand_logo_id to bonus_hunts

  1. Changes
    - Add `brand_logo_id` field to bonus_hunts table to link with brand logos
    - Add foreign key constraint to brand_logos table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bonus_hunts' AND column_name = 'brand_logo_id'
  ) THEN
    ALTER TABLE bonus_hunts ADD COLUMN brand_logo_id uuid REFERENCES brand_logos(id) ON DELETE SET NULL;
  END IF;
END $$;
