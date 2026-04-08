/*
  # Add Second Bonus to Fever Matches

  1. Changes
    - Add participant1_bonus2_id field to fever_matches
    - Add participant2_bonus2_id field to fever_matches
    - Add participant1_bonus2_result field for second bonus result
    - Add participant2_bonus2_result field for second bonus result
    - Points will be calculated as average of both bonuses

  2. Notes
    - Each participant now opens 2 bonuses per match
    - The average result of both bonuses determines the points
*/

-- Add second bonus fields for participant 1
ALTER TABLE fever_matches
ADD COLUMN IF NOT EXISTS participant1_bonus2_id uuid REFERENCES bonus_hunt_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS participant1_bonus2_result numeric(10, 2) DEFAULT 0;

-- Add second bonus fields for participant 2
ALTER TABLE fever_matches
ADD COLUMN IF NOT EXISTS participant2_bonus2_id uuid REFERENCES bonus_hunt_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS participant2_bonus2_result numeric(10, 2) DEFAULT 0;
