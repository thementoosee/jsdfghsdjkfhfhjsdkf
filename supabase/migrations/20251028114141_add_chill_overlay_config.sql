/*
  # Add Chill Session Overlay Configuration

  1. Changes
    - Add chill_overlay_config jsonb field to chill_sessions table
    - Stores visual configuration for the overlay display
  
  2. Configuration Fields
    - slot_image: URL or data URI for slot machine image
    - background_color: Hex color for background
    - accent_color: Hex color for accents
    - text_color: Hex color for text
    - show_slot_info: Boolean to show/hide slot details
    - show_session_stats: Boolean to show/hide statistics
    - show_personal_best: Boolean to show/hide personal best section
*/

-- Add chill_overlay_config to chill_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chill_sessions' AND column_name = 'chill_overlay_config'
  ) THEN
    ALTER TABLE chill_sessions ADD COLUMN chill_overlay_config jsonb DEFAULT '{
      "slot_image": "",
      "background_color": "#10b981",
      "accent_color": "#059669",
      "text_color": "#ffffff",
      "show_slot_info": true,
      "show_session_stats": true,
      "show_personal_best": true
    }'::jsonb;
  END IF;
END $$;
