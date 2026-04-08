/*
  # Auto-advance Playoff Winners to Next Round

  1. Changes
    - Create trigger function to automatically advance winners to next playoff round
    - When a quarter-final match determines a winner, add them to the corresponding semi-final
    - When a semi-final match determines a winner, add them to the final
    
  2. Logic
    - Quarter-finals matches 1-2 winners go to semi-final match 1 (positions 1 and 2)
    - Quarter-finals matches 3-4 winners go to semi-final match 2 (positions 1 and 2)
    - Semi-finals matches 1-2 winners go to final match (positions 1 and 2)
*/

-- Function to advance playoff winners to next round
CREATE OR REPLACE FUNCTION advance_playoff_winner()
RETURNS TRIGGER AS $$
DECLARE
  next_stage text;
  next_match_number int;
  next_position int;
  existing_match_id uuid;
BEGIN
  -- Only proceed if a winner was just determined (changed from NULL to a value)
  IF NEW.winner_id IS NOT NULL AND (OLD.winner_id IS NULL OR OLD.winner_id != NEW.winner_id) THEN
    
    -- Determine next stage and match
    IF NEW.stage = 'quarter_finals' THEN
      next_stage := 'semi_finals';
      -- Matches 1 and 2 go to semi 1, matches 3 and 4 go to semi 2
      IF NEW.match_number <= 2 THEN
        next_match_number := 1;
        next_position := NEW.match_number; -- 1 or 2
      ELSE
        next_match_number := 2;
        next_position := NEW.match_number - 2; -- 3->1, 4->2
      END IF;
    ELSIF NEW.stage = 'semi_finals' THEN
      next_stage := 'final';
      next_match_number := 1;
      next_position := NEW.match_number; -- 1 or 2
    ELSE
      -- Already in final, nothing to advance to
      RETURN NEW;
    END IF;

    -- Check if next match already exists
    SELECT id INTO existing_match_id
    FROM fever_playoff_matches
    WHERE tournament_id = NEW.tournament_id
      AND stage = next_stage
      AND match_number = next_match_number;

    IF existing_match_id IS NOT NULL THEN
      -- Update existing match with the winner
      IF next_position = 1 THEN
        UPDATE fever_playoff_matches
        SET participant1_id = NEW.winner_id,
            updated_at = now()
        WHERE id = existing_match_id;
      ELSE
        UPDATE fever_playoff_matches
        SET participant2_id = NEW.winner_id,
            updated_at = now()
        WHERE id = existing_match_id;
      END IF;
    ELSE
      -- Create new match for next stage
      IF next_position = 1 THEN
        INSERT INTO fever_playoff_matches (
          tournament_id,
          stage,
          match_number,
          participant1_id,
          participant2_id
        ) VALUES (
          NEW.tournament_id,
          next_stage,
          next_match_number,
          NEW.winner_id,
          NULL
        );
      ELSE
        INSERT INTO fever_playoff_matches (
          tournament_id,
          stage,
          match_number,
          participant1_id,
          participant2_id
        ) VALUES (
          NEW.tournament_id,
          next_stage,
          next_match_number,
          NULL,
          NEW.winner_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS advance_playoff_winner_trigger ON fever_playoff_matches;

-- Create trigger to advance winners
CREATE TRIGGER advance_playoff_winner_trigger
  AFTER INSERT OR UPDATE ON fever_playoff_matches
  FOR EACH ROW
  EXECUTE FUNCTION advance_playoff_winner();
