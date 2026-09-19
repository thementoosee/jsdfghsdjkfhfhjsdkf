-- Spotify now-playing tokens (service role only)
CREATE TABLE IF NOT EXISTS public.spotify_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  display_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.spotify_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.spotify_config FROM anon;
REVOKE ALL ON TABLE public.spotify_config FROM authenticated;
