/*
  # Add First Bonus to Fever Matches

  1. Changes
    - Add participant1_bonus_id field to fever_matches
    - Add participant2_bonus_id field to fever_matches
    - Add participant1_bonus_result field for first bonus result
    - Add participant2_bonus_result field for first bonus result
*/

-- Add first bonus fields for participant 1
ALTER TABLE fever_matches
ADD COLUMN IF NOT EXISTS participant1_bonus_id uuid REFERENCES bonus_hunt_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS participant1_bonus_result numeric(10, 2) DEFAULT NULL;

-- Add first bonus fields for participant 2
ALTER TABLE fever_matches
ADD COLUMN IF NOT EXISTS participant2_bonus_id uuid REFERENCES bonus_hunt_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS participant2_bonus_result numeric(10, 2) DEFAULT NULL;
