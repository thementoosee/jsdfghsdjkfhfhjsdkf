-- Fix twitch_alerts idempotency for PostgREST/supabase-js upsert(onConflict: 'event_id').
-- The previous partial UNIQUE index (WHERE event_id IS NOT NULL) cannot satisfy
-- ON CONFLICT (event_id), which caused:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- A normal UNIQUE constraint still allows multiple NULL event_id values in PostgreSQL.

DROP INDEX IF EXISTS public.twitch_alerts_event_id_unique;

ALTER TABLE public.twitch_alerts
  DROP CONSTRAINT IF EXISTS twitch_alerts_event_id_key;

ALTER TABLE public.twitch_alerts
  ADD CONSTRAINT twitch_alerts_event_id_key UNIQUE (event_id);
