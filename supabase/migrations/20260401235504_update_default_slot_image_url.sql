/*
  # Update Default Slot Image URL

  1. Changes
    - Updates the default slot image URL to use the new question mark image
    - Updates existing slots with the old default image to the new one
  
  2. Notes
    - The new image (/wVqLzwT copy.png) will be used as the default fallback
    - Existing custom slot images will not be affected
*/

-- Update existing slots that have the old default or NULL image
UPDATE slots 
SET image_url = '/wVqLzwT copy.png'
WHERE image_url IS NULL 
   OR image_url = 'https://pjwohykealxvxmsgjdto.supabase.co/storage/v1/object/public/slot-images/default-slot-thumbnail.png'
   OR image_url = '/slott-1200x630sh.png';