/*
  # Fix twitch_config refresh_token field

  1. Changes
    - Make refresh_token nullable since we're using a long-lived access token
    - This allows the integration to work without requiring OAuth refresh flow
  
  2. Notes
    - For simple Twitch IRC bot integration, we only need the access token
    - Refresh token is optional and only needed for OAuth refresh flows
*/

ALTER TABLE twitch_config 
  ALTER COLUMN refresh_token DROP NOT NULL;
