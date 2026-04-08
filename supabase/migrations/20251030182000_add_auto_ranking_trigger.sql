/*
  # Add Auto-Ranking System for Fever Participants

  1. New Function
    - update_fever_participant_positions() - Automatically updates participant positions based on points

  2. Trigger
    - After any change to fever_participants points, recalculate all positions within the same group

  3. Logic
    - Participants are ranked by points (descending)
    - Within the same group, highest points = position 1
    - Ties are handled by position order (earlier participant gets better position)
*/

-- Function to update participant positions within their group
CREATE OR REPLACE FUNCTION update_fever_participant_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- Update positions for all participants in the same group
  WITH ranked_participants AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY group_id
        ORDER BY points DESC, created_at ASC
      ) as new_position
    FROM fever_participants
    WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
  )
  UPDATE fever_participants fp
  SET position = rp.new_position
  FROM ranked_participants rp
  WHERE fp.id = rp.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update positions when points change
CREATE TRIGGER update_fever_participant_positions_trigger
  AFTER INSERT OR UPDATE OF points OR DELETE ON fever_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_fever_participant_positions();
