-- Add is_extreme_bonus field to bonus_hunt_items
ALTER TABLE bonus_hunt_items
  ADD COLUMN IF NOT EXISTS is_extreme_bonus boolean DEFAULT false;
