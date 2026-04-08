/*
  # Simplify Fever Match Triggers

  1. Changes
    - Remove dependency on bonus_hunt_items
    - Keep only the trigger that calculates points based on manual result entry
    - Points are calculated when participant results are updated manually

  2. Logic
    - When both bonus results for a participant are set, calculate average
    - Award points based on average: 0x-25x=0pts, 26x-49x=1pt, 50x-99x=2pts, 100x+=3pts
    - Update participant points in fever_participants table
*/

-- Drop old trigger that depended on bonus_hunt_items
DROP TRIGGER IF EXISTS update_fever_match_bonus_results_trigger ON bonus_hunt_items;
DROP FUNCTION IF EXISTS update_fever_match_bonus_results();

-- The calculate_fever_match_points function and trigger remain the same
-- They automatically calculate points when bonus results are updated manually
