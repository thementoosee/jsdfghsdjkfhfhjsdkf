/*
  # Add Chat Overlay Configuration Documentation

  ## Overview
  Documents the chat overlay configuration structure that will be stored in the existing `config` jsonb column.

  ## Configuration Structure for Chat Overlays
  The `config` jsonb column for overlays with type='chat' will store:
  - `backgroundColor` (text) - Hex color for chat background
  - `textColor` (text) - Hex color for message text
  - `fontSize` (number) - Font size in pixels
  - `maxMessages` (number) - Maximum number of messages to display
  - `messageDirection` (text) - Either 'up' or 'down' for message flow direction
  - `showUsername` (boolean) - Whether to display usernames
  - `usernameColor` (text) - Hex color for usernames
  - `borderRadius` (number) - Border radius in pixels
  - `opacity` (number) - Opacity value between 0 and 1

  ## Notes
  - No schema changes needed - using existing jsonb column
  - This migration serves as documentation of the config structure
  - Frontend components will handle reading/writing these fields
*/

-- No actual schema changes needed
-- The config jsonb column already exists and can store any JSON structure
-- This migration documents the expected structure for chat overlays

SELECT 1;
