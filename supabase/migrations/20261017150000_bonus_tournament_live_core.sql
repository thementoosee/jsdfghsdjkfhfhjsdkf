/*
  # Bonus Tournament — live core (REAL tournaments)

  Adds:
  - bonus_tournaments (canonical live state + single ACTIVE)
  - Public SELECT for OBS on active tournament + its entries
  - Admin writes via is_bonus_tournament_admin() (Edge / authenticated)
  - Fixes draw presentation phases + result assert for 8 players / 4 matchups
  - Twitch enroll target remains bonus_tournament_entries (service_role only insert)

  PENDING remote apply — do not run without approval.
*/

-- ---------------------------------------------------------------------------
-- Canonical tournament row (Dashboard + OBS source of truth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonus_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bonus Tournament',
  chat_command text NOT NULL DEFAULT '!torneio',
  prize_pool numeric NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  status text NOT NULL DEFAULT 'entries'
    CHECK (status IN (
      'preparation', 'entries', 'draw', 'qf', 'sf', 'final', 'completed'
    )),
  is_active boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  entries_open boolean NOT NULL DEFAULT false,
  entries_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_match_id text NULL,
  overlay_view text NOT NULL DEFAULT 'entries'
    CHECK (overlay_view IN ('overview', 'duel', 'entries', 'draw')),
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_tournaments_updated_at_idx
  ON public.bonus_tournaments (updated_at DESC);

CREATE INDEX IF NOT EXISTS bonus_tournaments_status_idx
  ON public.bonus_tournaments (status);

-- Exactly one ACTIVE tournament at a time
CREATE UNIQUE INDEX IF NOT EXISTS bonus_tournaments_one_active_idx
  ON public.bonus_tournaments ((is_active))
  WHERE is_active = true;

ALTER TABLE public.bonus_tournaments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bonus_tournaments FROM PUBLIC;
GRANT SELECT ON TABLE public.bonus_tournaments TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bonus_tournaments FROM anon, authenticated;

-- Public OBS: ACTIVE only. Writes via Edge service_role (see 20261017160000).
DROP POLICY IF EXISTS "Public can select bonus tournaments" ON public.bonus_tournaments;
DROP POLICY IF EXISTS "Anon can select ACTIVE bonus tournaments" ON public.bonus_tournaments;
CREATE POLICY "Anon can select ACTIVE bonus tournaments"
  ON public.bonus_tournaments
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- Entries: allow OBS to read enrollments of the ACTIVE tournament only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can select entries of active tournament"
  ON public.bonus_tournament_entries;
CREATE POLICY "Public can select entries of active tournament"
  ON public.bonus_tournament_entries
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bonus_tournaments t
      WHERE t.id::text = tournament_id
        AND t.is_active = true
    )
  );

GRANT SELECT ON TABLE public.bonus_tournament_entries TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activate helper (exclusive ACTIVE + version bump)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bt_activate_tournament(p_tournament_id uuid, p_active boolean)
RETURNS public.bonus_tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.bonus_tournaments;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'bt: forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_active THEN
    UPDATE public.bonus_tournaments
    SET is_active = false, state_version = state_version + 1, updated_at = now()
    WHERE is_active = true
      AND id IS DISTINCT FROM p_tournament_id;

    UPDATE public.bonus_tournaments
    SET is_active = true, state_version = state_version + 1, updated_at = now()
    WHERE id = p_tournament_id
    RETURNING * INTO row_out;
  ELSE
    UPDATE public.bonus_tournaments
    SET is_active = false, state_version = state_version + 1, updated_at = now()
    WHERE id = p_tournament_id
    RETURNING * INTO row_out;
  END IF;

  IF row_out.id IS NULL THEN
    RAISE EXCEPTION 'bt: tournament not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_activate_tournament(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_activate_tournament(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bt_activate_tournament(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- CAS-ish state write for matches / pays / overlay (admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bt_tournament_cas_write(
  p_tournament_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
RETURNS public.bonus_tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_version bigint;
  row_out public.bonus_tournaments;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'bt: forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bt_live:' || p_tournament_id::text));

  SELECT state_version INTO cur_version
  FROM public.bonus_tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bt: tournament not found' USING ERRCODE = 'P0002';
  END IF;

  IF cur_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'bt: version conflict (have %, expected %)', cur_version, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bonus_tournaments SET
    name = COALESCE(p_payload ->> 'name', name),
    chat_command = COALESCE(p_payload ->> 'chat_command', chat_command),
    prize_pool = COALESCE((p_payload ->> 'prize_pool')::numeric, prize_pool),
    status = COALESCE(p_payload ->> 'status', status),
    entries_open = COALESCE((p_payload ->> 'entries_open')::boolean, entries_open),
    entries_config = CASE WHEN p_payload ? 'entries_config' THEN p_payload -> 'entries_config' ELSE entries_config END,
    players = CASE WHEN p_payload ? 'players' THEN p_payload -> 'players' ELSE players END,
    matches = CASE WHEN p_payload ? 'matches' THEN p_payload -> 'matches' ELSE matches END,
    selected_match_id = CASE
      WHEN p_payload ? 'selected_match_id' THEN NULLIF(p_payload ->> 'selected_match_id', '')
      ELSE selected_match_id
    END,
    overlay_view = COALESCE(p_payload ->> 'overlay_view', overlay_view),
    state_version = p_expected_version + 1,
    updated_at = now()
  WHERE id = p_tournament_id
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Fix draw presentation phases for slot flow (8 players)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bonus_tournament_draw_presentations
  DROP CONSTRAINT IF EXISTS bonus_tournament_draw_presentations_phase_check;

ALTER TABLE public.bonus_tournament_draw_presentations
  ADD CONSTRAINT bonus_tournament_draw_presentations_phase_check
  CHECK (phase IN (
    'idle', 'intro', 'countdown', 'reveal_player',
    'awaiting_slot', 'slot_confirmed', 'slots_ready',
    'show_selected', 'reveal_match', 'show_bracket', 'awaiting_advance'
  ));

-- Replace 16/8 assert with 8/4 (matches DRAW_SLOT_COUNT / DRAW_MATCH_COUNT)
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
  n_sel int := 8;
  n_m int := 4;
BEGIN
  IF p_result IS NULL THEN
    RETURN;
  END IF;

  selected := p_result -> 'selected';
  matchups := p_result -> 'matchups';

  IF selected IS NULL OR jsonb_typeof(selected) <> 'array' OR jsonb_array_length(selected) <> n_sel THEN
    RAISE EXCEPTION 'bt_draw: result.selected must have % players', n_sel USING ERRCODE = 'check_violation';
  END IF;
  IF matchups IS NULL OR jsonb_typeof(matchups) <> 'array' OR jsonb_array_length(matchups) <> n_m THEN
    RAISE EXCEPTION 'bt_draw: result.matchups must have % pairs', n_m USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(x ORDER BY ordinality)
  INTO ids
  FROM jsonb_array_elements(selected) WITH ORDINALITY AS t(elem, ordinality),
       LATERAL (SELECT elem ->> 'twitchUserId') AS s(x);

  IF ids IS NULL OR array_length(ids, 1) <> n_sel THEN
    RAISE EXCEPTION 'bt_draw: invalid selected ids' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) AS u(id) WHERE id IS NULL OR id = '') THEN
    RAISE EXCEPTION 'bt_draw: empty twitchUserId' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(ids) AS u(id)) <> n_sel THEN
    RAISE EXCEPTION 'bt_draw: duplicate selected twitchUserId' USING ERRCODE = 'check_violation';
  END IF;

  FOR i IN 0..(n_m - 1) LOOP
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

  IF (SELECT count(*) FROM unnest(seen) s(id) WHERE id = ANY (ids)) <> n_sel THEN
    RAISE EXCEPTION 'bt_draw: matchups must cover selected' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bonus_tournaments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bonus_tournaments;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bonus_tournament_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bonus_tournament_entries;
  END IF;
END $$;
