/*
  # Fix Default Slot Image Path

  1. Changes
    - Updates slots to use the renamed default image (without spaces in filename)
  
  2. Notes
    - The image was renamed from "wVqLzwT copy.png" to "wVqLzwT_default.png"
*/

-- Update slots to use the new filename
UPDATE slots 
SET image_url = '/wVqLzwT_default.png'
WHERE image_url = '/wVqLzwT copy.png';