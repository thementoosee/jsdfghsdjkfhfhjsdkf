/*
  # Bonus Tournament — draw presentations + entries (local, pending remote apply)

  Security model:
  - anon/authenticated: SELECT presentations only (OBS).
  - No browser INSERT/UPDATE/DELETE on presentations or entries.
  - Writes via Edge Functions (service_role) + bt_draw_cas_write (advisory lock + version CAS).
  - GENERATE reads trusted rows from bonus_tournament_entries (never client roster).
  - Timings live in draw-timing.json / Edge TS — SQL tick does NOT hardcode phase durations
    (auto-advance is Edge `bonus-tournament-draw-tick` calling advance + cas_write).

  PENDING remote apply — do not run without approval.
*/

-- ---------------------------------------------------------------------------
-- Trusted enrollment source (empty until Twitch/real enrollment wires in)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bonus_tournament_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id text NOT NULL,
  twitch_user_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_tournament_entries_twitch_unique UNIQUE (tournament_id, twitch_user_id)
);

CREATE INDEX IF NOT EXISTS bonus_tournament_entries_tournament_idx
  ON bonus_tournament_entries (tournament_id);

ALTER TABLE bonus_tournament_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE bonus_tournament_entries FROM PUBLIC;
REVOKE ALL ON TABLE bonus_tournament_entries FROM anon, authenticated;
-- service_role bypasses RLS (Edge only). No public read of full enrollment lists.

-- ---------------------------------------------------------------------------
-- Presentation state (OBS-readable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bonus_tournament_draw_presentations (
  tournament_id text PRIMARY KEY,
  presentation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_name text NOT NULL DEFAULT '',
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_status text NOT NULL DEFAULT 'idle'
    CHECK (run_status IN ('idle', 'running', 'paused', 'completed')),
  phase text NOT NULL DEFAULT 'idle'
    CHECK (phase IN (
      'idle', 'intro', 'countdown', 'reveal_player', 'show_selected',
      'reveal_match', 'show_bracket', 'awaiting_advance'
    )),
  revealed_players integer NOT NULL DEFAULT 0 CHECK (revealed_players >= 0 AND revealed_players <= 16),
  revealed_matches integer NOT NULL DEFAULT 0 CHECK (revealed_matches >= 0 AND revealed_matches <= 8),
  countdown_value integer NULL CHECK (countdown_value IS NULL OR countdown_value BETWEEN 1 AND 3),
  phase_started_at timestamptz NULL,
  phase_duration_ms integer NULL,
  result jsonb NULL,
  result_locked_at timestamptz NULL,
  entries_closed boolean NOT NULL DEFAULT false,
  unique_entry_count integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_tournament_draw_presentations_updated_at_idx
  ON bonus_tournament_draw_presentations (updated_at DESC);

ALTER TABLE bonus_tournament_draw_presentations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON bonus_tournament_draw_presentations TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON bonus_tournament_draw_presentations FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON bonus_tournament_draw_presentations FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin claim helper (app_metadata only; bonus_tournament_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_bonus_tournament_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'bonus_tournament_admin') = 'true',
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_bonus_tournament_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_bonus_tournament_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_bonus_tournament_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Validate draw result JSON (16 unique + 8 matchups covering all)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bt_draw_assert_result_valid(p_result jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  selected jsonb;
  matchups jsonb;
  ids text[];
  seen text[] := ARRAY[]::text[];
  a text;
  b text;
  i int;
BEGIN
  IF p_result IS NULL THEN
    RETURN;
  END IF;

  selected := p_result -> 'selected';
  matchups := p_result -> 'matchups';

  IF selected IS NULL OR jsonb_typeof(selected) <> 'array' OR jsonb_array_length(selected) <> 16 THEN
    RAISE EXCEPTION 'bt_draw: result.selected must have 16 players' USING ERRCODE = 'check_violation';
  END IF;
  IF matchups IS NULL OR jsonb_typeof(matchups) <> 'array' OR jsonb_array_length(matchups) <> 8 THEN
    RAISE EXCEPTION 'bt_draw: result.matchups must have 8 pairs' USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(x ORDER BY ordinality)
  INTO ids
  FROM jsonb_array_elements(selected) WITH ORDINALITY AS t(elem, ordinality),
       LATERAL (SELECT elem ->> 'twitchUserId') AS s(x);

  IF ids IS NULL OR array_length(ids, 1) <> 16 THEN
    RAISE EXCEPTION 'bt_draw: invalid selected ids' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) AS u(id) WHERE id IS NULL OR id = '') THEN
    RAISE EXCEPTION 'bt_draw: empty twitchUserId' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(ids) AS u(id)) <> 16 THEN
    RAISE EXCEPTION 'bt_draw: duplicate selected twitchUserId' USING ERRCODE = 'check_violation';
  END IF;

  FOR i IN 0..7 LOOP
    a := matchups -> i -> 'playerA' ->> 'twitchUserId';
    b := matchups -> i -> 'playerB' ->> 'twitchUserId';
    IF a IS NULL OR b IS NULL OR a = '' OR b = '' THEN
      RAISE EXCEPTION 'bt_draw: invalid matchup at %', i USING ERRCODE = 'check_violation';
    END IF;
    IF a = ANY (seen) OR b = ANY (seen) THEN
      RAISE EXCEPTION 'bt_draw: player reused in matchups' USING ERRCODE = 'check_violation';
    END IF;
    seen := seen || a || b;
  END LOOP;

  IF (SELECT count(*) FROM unnest(seen) s(id) WHERE id = ANY (ids)) <> 16 THEN
    RAISE EXCEPTION 'bt_draw: matchups must cover selected' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_draw_assert_result_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_draw_assert_result_valid(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row protect trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bt_draw_protect_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allow_replace text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version < OLD.version THEN
      RAISE EXCEPTION 'bt_draw: version cannot decrease (% -> %)', OLD.version, NEW.version
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.version = OLD.version AND (
      NEW.phase IS DISTINCT FROM OLD.phase
      OR NEW.run_status IS DISTINCT FROM OLD.run_status
      OR NEW.revealed_players IS DISTINCT FROM OLD.revealed_players
      OR NEW.revealed_matches IS DISTINCT FROM OLD.revealed_matches
      OR NEW.result IS DISTINCT FROM OLD.result
      OR NEW.event_id IS DISTINCT FROM OLD.event_id
    ) THEN
      RAISE EXCEPTION 'bt_draw: version must increase on state change'
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
      allow_replace := nullif(current_setting('bt.allow_result_replace', true), '');
      IF allow_replace IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'bt_draw: result is immutable once locked'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF OLD.result IS NULL AND NEW.result IS NOT NULL THEN
      NEW.result_locked_at := COALESCE(NEW.result_locked_at, now());
    END IF;
  END IF;

  IF NEW.result IS NOT NULL THEN
    PERFORM public.bt_draw_assert_result_valid(NEW.result);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bt_draw_protect_row_trg ON bonus_tournament_draw_presentations;
CREATE TRIGGER bt_draw_protect_row_trg
  BEFORE INSERT OR UPDATE ON bonus_tournament_draw_presentations
  FOR EACH ROW
  EXECUTE FUNCTION public.bt_draw_protect_row();

REVOKE ALL ON FUNCTION public.bt_draw_protect_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_draw_protect_row() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (SELECT only for presentations)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can select bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Admin can insert bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Admin can update bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Admin can delete bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Public can view bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Public can insert bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Public can update bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;
DROP POLICY IF EXISTS "Public can delete bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations;

CREATE POLICY "Anon can select bonus tournament draw presentations"
  ON bonus_tournament_draw_presentations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Atomic CAS write (advisory lock + expected version)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bt_draw_cas_write(
  p_tournament_id text,
  p_expected_version bigint,
  p_payload jsonb,
  p_allow_result_replace boolean DEFAULT false
)
RETURNS bonus_tournament_draw_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_version bigint;
  next_version bigint;
  row_out bonus_tournament_draw_presentations;
  payload_version bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bt_draw:' || p_tournament_id));

  IF p_allow_result_replace THEN
    PERFORM set_config('bt.allow_result_replace', 'on', true);
  END IF;

  payload_version := COALESCE((p_payload ->> 'version')::bigint, -1);
  IF payload_version <> p_expected_version + 1 THEN
    RAISE EXCEPTION 'bt_draw: payload version must be expected+1'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT version INTO cur_version
  FROM bonus_tournament_draw_presentations
  WHERE tournament_id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN
      RAISE EXCEPTION 'bt_draw: version conflict (missing row)' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bonus_tournament_draw_presentations (
      tournament_id, presentation_id, tournament_name, version, event_id,
      run_status, phase, revealed_players, revealed_matches, countdown_value,
      phase_started_at, phase_duration_ms, result, entries_closed,
      unique_entry_count, is_demo, updated_at
    ) VALUES (
      p_tournament_id,
      COALESCE((p_payload ->> 'presentation_id')::uuid, gen_random_uuid()),
      COALESCE(p_payload ->> 'tournament_name', ''),
      payload_version,
      COALESCE((p_payload ->> 'event_id')::uuid, gen_random_uuid()),
      COALESCE(p_payload ->> 'run_status', 'idle'),
      COALESCE(p_payload ->> 'phase', 'idle'),
      COALESCE((p_payload ->> 'revealed_players')::int, 0),
      COALESCE((p_payload ->> 'revealed_matches')::int, 0),
      NULLIF(p_payload ->> 'countdown_value', '')::int,
      NULLIF(p_payload ->> 'phase_started_at', '')::timestamptz,
      NULLIF(p_payload ->> 'phase_duration_ms', '')::int,
      p_payload -> 'result',
      COALESCE((p_payload ->> 'entries_closed')::boolean, false),
      COALESCE((p_payload ->> 'unique_entry_count')::int, 0),
      COALESCE((p_payload ->> 'is_demo')::boolean, true),
      now()
    )
    RETURNING * INTO row_out;

    RETURN row_out;
  END IF;

  IF cur_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'bt_draw: version conflict (have %, expected %)', cur_version, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;

  next_version := payload_version;

  UPDATE bonus_tournament_draw_presentations SET
    presentation_id = COALESCE((p_payload ->> 'presentation_id')::uuid, presentation_id),
    tournament_name = COALESCE(p_payload ->> 'tournament_name', tournament_name),
    version = next_version,
    event_id = COALESCE((p_payload ->> 'event_id')::uuid, gen_random_uuid()),
    run_status = COALESCE(p_payload ->> 'run_status', run_status),
    phase = COALESCE(p_payload ->> 'phase', phase),
    revealed_players = COALESCE((p_payload ->> 'revealed_players')::int, revealed_players),
    revealed_matches = COALESCE((p_payload ->> 'revealed_matches')::int, revealed_matches),
    countdown_value = CASE
      WHEN p_payload ? 'countdown_value' THEN NULLIF(p_payload ->> 'countdown_value', '')::int
      ELSE countdown_value
    END,
    phase_started_at = CASE
      WHEN p_payload ? 'phase_started_at' THEN NULLIF(p_payload ->> 'phase_started_at', '')::timestamptz
      ELSE phase_started_at
    END,
    phase_duration_ms = CASE
      WHEN p_payload ? 'phase_duration_ms' THEN NULLIF(p_payload ->> 'phase_duration_ms', '')::int
      ELSE phase_duration_ms
    END,
    result = CASE WHEN p_payload ? 'result' THEN p_payload -> 'result' ELSE result END,
    entries_closed = COALESCE((p_payload ->> 'entries_closed')::boolean, entries_closed),
    unique_entry_count = COALESCE((p_payload ->> 'unique_entry_count')::int, unique_entry_count),
    updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND version = p_expected_version
  RETURNING * INTO row_out;

  IF row_out.tournament_id IS NULL THEN
    RAISE EXCEPTION 'bt_draw: version conflict on update' USING ERRCODE = 'P0001';
  END IF;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_draw_cas_write(text, bigint, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_draw_cas_write(text, bigint, jsonb, boolean) FROM anon, authenticated;

-- Legacy regenerate helper (optional) — also locked down
CREATE OR REPLACE FUNCTION public.bt_draw_regenerate_result(
  p_tournament_id text,
  p_result jsonb,
  p_expected_version bigint,
  p_presentation_id uuid DEFAULT gen_random_uuid()
)
RETURNS bonus_tournament_draw_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bt_draw_assert_result_valid(p_result);
  RETURN public.bt_draw_cas_write(
    p_tournament_id,
    p_expected_version,
    jsonb_build_object(
      'presentation_id', p_presentation_id,
      'version', p_expected_version + 1,
      'event_id', gen_random_uuid(),
      'run_status', 'idle',
      'phase', 'idle',
      'revealed_players', 0,
      'revealed_matches', 0,
      'countdown_value', NULL,
      'phase_started_at', NULL,
      'phase_duration_ms', NULL,
      'result', p_result
    ),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bt_draw_regenerate_result(text, jsonb, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_draw_regenerate_result(text, jsonb, bigint, uuid) FROM anon, authenticated;

-- Drop old hardcoded SQL tick if present (advance is Edge-owned using draw-timing.json)
DROP FUNCTION IF EXISTS public.bt_draw_tick(text);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bonus_tournament_draw_presentations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bonus_tournament_draw_presentations;
  END IF;
END $$;
