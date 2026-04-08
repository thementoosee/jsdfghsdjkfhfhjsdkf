/*
  # Enable Realtime for Overlays Table

  ## Overview
  Enables Supabase Realtime for the overlays table so that changes are broadcast instantly to all connected clients.

  ## Changes
  - Add overlays table to the supabase_realtime publication
  - This allows real-time updates when overlay configurations change

  ## Notes
  - Clients can now subscribe to changes on the overlays table
  - Updates will be broadcast immediately without polling
*/

-- Enable realtime for overlays table
ALTER PUBLICATION supabase_realtime ADD TABLE overlays;
