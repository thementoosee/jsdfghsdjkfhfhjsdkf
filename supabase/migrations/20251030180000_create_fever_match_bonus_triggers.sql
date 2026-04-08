/*
  # Create Fever Match Bonus Auto-Update System

  1. New Functions
    - update_fever_match_bonus_results() - Updates match bonus results when bonus hunt items are opened
    - calculate_fever_match_points() - Calculates and updates participant points based on average of 2 bonuses

  2. Triggers
    - After bonus_hunt_items.result is updated, automatically update the corresponding fever_match bonus results
    - After fever_match bonus results are updated, calculate and update participant points

  3. Logic
    - When a bonus is opened (result set), find any fever_match that references it
    - Update the corresponding bonus_result field in the match
    - Calculate average of both bonuses (if both are opened)
    - Award points based on average: 0x-25x=0pts, 26x-49x=1pt, 50x-99x=2pts, 100x+=3pts
    - Update participant points in fever_participants table
*/

-- Function to update match bonus results when bonus hunt items are opened
CREATE OR REPLACE FUNCTION update_fever_match_bonus_results()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if result was just set (from null to a value)
  IF OLD.result IS NULL AND NEW.result IS NOT NULL THEN
    -- Update participant1_bonus_result
    UPDATE fever_matches
    SET participant1_bonus_result = NEW.result
    WHERE participant1_bonus_id = NEW.id;

    -- Update participant1_bonus2_result
    UPDATE fever_matches
    SET participant1_bonus2_result = NEW.result
    WHERE participant1_bonus2_id = NEW.id;

    -- Update participant2_bonus_result
    UPDATE fever_matches
    SET participant2_bonus_result = NEW.result
    WHERE participant2_bonus_id = NEW.id;

    -- Update participant2_bonus2_result
    UPDATE fever_matches
    SET participant2_bonus2_result = NEW.result
    WHERE participant2_bonus2_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate and update match points
CREATE OR REPLACE FUNCTION calculate_fever_match_points()
RETURNS TRIGGER AS $$
DECLARE
  p1_avg numeric;
  p2_avg numeric;
  p1_points integer;
  p2_points integer;
BEGIN
  -- Calculate participant 1 average and points
  IF NEW.participant1_bonus_result IS NOT NULL AND NEW.participant1_bonus2_result IS NOT NULL THEN
    p1_avg := (NEW.participant1_bonus_result + NEW.participant1_bonus2_result) / 2.0;

    IF p1_avg >= 100 THEN
      p1_points := 3;
    ELSIF p1_avg >= 50 THEN
      p1_points := 2;
    ELSIF p1_avg >= 26 THEN
      p1_points := 1;
    ELSE
      p1_points := 0;
    END IF;

    NEW.participant1_points := p1_points;

    -- Update participant total points
    UPDATE fever_participants
    SET points = points - COALESCE(OLD.participant1_points, 0) + p1_points
    WHERE id = NEW.participant1_id;
  END IF;

  -- Calculate participant 2 average and points
  IF NEW.participant2_bonus_result IS NOT NULL AND NEW.participant2_bonus2_result IS NOT NULL THEN
    p2_avg := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2.0;

    IF p2_avg >= 100 THEN
      p2_points := 3;
    ELSIF p2_avg >= 50 THEN
      p2_points := 2;
    ELSIF p2_avg >= 26 THEN
      p2_points := 1;
    ELSE
      p2_points := 0;
    END IF;

    NEW.participant2_points := p2_points;

    -- Update participant total points
    UPDATE fever_participants
    SET points = points - COALESCE(OLD.participant2_points, 0) + p2_points
    WHERE id = NEW.participant2_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on bonus_hunt_items to update fever_matches when bonus is opened
CREATE TRIGGER update_fever_match_bonus_results_trigger
  AFTER UPDATE ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_match_bonus_results();

-- Trigger on fever_matches to calculate points when bonus results change
CREATE TRIGGER calculate_fever_match_points_trigger
  BEFORE UPDATE ON fever_matches
  FOR EACH ROW
  WHEN (
    (NEW.participant1_bonus_result IS DISTINCT FROM OLD.participant1_bonus_result) OR
    (NEW.participant1_bonus2_result IS DISTINCT FROM OLD.participant1_bonus2_result) OR
    (NEW.participant2_bonus_result IS DISTINCT FROM OLD.participant2_bonus_result) OR
    (NEW.participant2_bonus2_result IS DISTINCT FROM OLD.participant2_bonus2_result)
  )
  EXECUTE FUNCTION calculate_fever_match_points();
