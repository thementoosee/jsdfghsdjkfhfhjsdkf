/*
  # Update Fever Points Calculation Formula

  1. Changes
    - Update `calculate_fever_points` function to use new multiplier scale (x100)
    - New thresholds: 2501-4999x=1pt, 5000-9999x=2pts, 10000x+=3pts
    - Update `calculate_fever_match_points` function with new thresholds

  2. Rationale
    - Multipliers are now calculated as (payout / bonus_cost) * 100
    - Example: cost=100€, payout=250€ → 250x (instead of 2.5x)
    - This provides more intuitive values for users
*/

-- Update the function that calculates points based on multiplier
CREATE OR REPLACE FUNCTION calculate_fever_points(multiplier numeric)
RETURNS integer AS $$
BEGIN
  IF multiplier >= 10000 THEN
    RETURN 3;
  ELSIF multiplier >= 5000 THEN
    RETURN 2;
  ELSIF multiplier >= 2501 THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update function to calculate and update match points
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

    IF p1_avg >= 10000 THEN
      p1_points := 3;
    ELSIF p1_avg >= 5000 THEN
      p1_points := 2;
    ELSIF p1_avg >= 2501 THEN
      p1_points := 1;
    ELSE
      p1_points := 0;
    END IF;

    NEW.participant1_points := p1_points;
  ELSE
    NEW.participant1_points := 0;
  END IF;

  -- Calculate participant 2 average and points
  IF NEW.participant2_bonus_result IS NOT NULL AND NEW.participant2_bonus2_result IS NOT NULL THEN
    p2_avg := (NEW.participant2_bonus_result + NEW.participant2_bonus2_result) / 2.0;

    IF p2_avg >= 10000 THEN
      p2_points := 3;
    ELSIF p2_avg >= 5000 THEN
      p2_points := 2;
    ELSIF p2_avg >= 2501 THEN
      p2_points := 1;
    ELSE
      p2_points := 0;
    END IF;

    NEW.participant2_points := p2_points;
  ELSE
    NEW.participant2_points := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;