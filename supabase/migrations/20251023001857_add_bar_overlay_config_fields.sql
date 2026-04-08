/*
  # Add Bar Overlay Configuration Fields

  ## Overview
  Adds documentation for the bar overlay configuration structure that will be stored in the existing `config` jsonb column.

  ## Configuration Structure for Bar Overlays
  The `config` jsonb column for overlays with type='bar' will store:
  - `nowText` (text) - Custom text to display in the NOW section
  - `brandLogo` (text) - URL of the brand logo image
  - `streamMode` (text) - Either 'raw' or 'wager' to indicate stream mode

  ## Notes
  - No schema changes needed - using existing jsonb column
  - This migration serves as documentation of the config structure
  - Frontend components will handle reading/writing these fields
*/

-- No actual schema changes needed
-- The config jsonb column already exists and can store any JSON structure
-- This migration documents the expected structure for bar overlays

SELECT 1;
