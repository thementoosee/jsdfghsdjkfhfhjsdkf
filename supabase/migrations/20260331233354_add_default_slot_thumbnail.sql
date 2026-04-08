/*
  # Add default thumbnail for slots

  1. Changes
    - Add a trigger to automatically set default thumbnail for slots without image_url
    - Updates existing slots with NULL or empty image_url to use default thumbnail
  
  2. Details
    - Default thumbnail: /wVqLzwT.png
    - Trigger fires before INSERT or UPDATE on slots table
    - Only sets default if image_url is NULL or empty string
*/

-- Function to set default slot thumbnail
CREATE OR REPLACE FUNCTION set_default_slot_thumbnail()
RETURNS TRIGGER AS $$
BEGIN
  -- If image_url is NULL or empty, set the default thumbnail
  IF NEW.image_url IS NULL OR NEW.image_url = '' THEN
    NEW.image_url := '/wVqLzwT.png';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_default_slot_thumbnail ON slots;

-- Create trigger to set default thumbnail
CREATE TRIGGER trigger_set_default_slot_thumbnail
  BEFORE INSERT OR UPDATE ON slots
  FOR EACH ROW
  EXECUTE FUNCTION set_default_slot_thumbnail();

-- Update any existing slots without thumbnails
UPDATE slots 
SET image_url = '/wVqLzwT.png' 
WHERE image_url IS NULL OR image_url = '';