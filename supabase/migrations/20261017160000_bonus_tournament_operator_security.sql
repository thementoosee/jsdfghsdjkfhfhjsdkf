/*
  # Bonus Tournament — operator security (Phase 0)

  - Anon / authenticated: NO administrative writes
  - Public SELECT limited to ACTIVE tournament (+ its entries / draw)
  - Admin RPCs: EXECUTE only for service_role (Edge + BT_OPERATOR_SECRET)
  - Remove dependency on Dashboard Auth / magic link for live ops

  PENDING remote apply — local / staging only until authorized.
*/

-- ---------------------------------------------------------------------------
-- Public read: ACTIVE tournaments only (OBS)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can select bonus tournaments" ON public.bonus_tournaments;
DROP POLICY IF EXISTS "Anon can select ACTIVE bonus tournaments" ON public.bonus_tournaments;
DROP POLICY IF EXISTS "Admin can insert bonus tournaments" ON public.bonus_tournaments;
DROP POLICY IF EXISTS "Admin can update bonus tournaments" ON public.bonus_tournaments;
DROP POLICY IF EXISTS "Admin can delete bonus tournaments" ON public.bonus_tournaments;

CREATE POLICY "Anon can select ACTIVE bonus tournaments"
  ON public.bonus_tournaments
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

REVOKE INSERT, UPDATE, DELETE ON public.bonus_tournaments FROM anon, authenticated;
-- service_role bypasses RLS for Edge admin

-- ---------------------------------------------------------------------------
-- Entries: public read only when parent is ACTIVE; no client writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can select entries of active tournament"
  ON public.bonus_tournament_entries;

CREATE POLICY "Anon can select entries of ACTIVE tournament"
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

REVOKE INSERT, UPDATE, DELETE ON public.bonus_tournament_entries FROM anon, authenticated;
GRANT SELECT ON public.bonus_tournament_entries TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Draw presentations: only expose rows whose tournament is ACTIVE (or legacy demo id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can select bonus tournament draw presentations"
  ON public.bonus_tournament_draw_presentations;

CREATE POLICY "Anon can select ACTIVE draw presentations"
  ON public.bonus_tournament_draw_presentations
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

REVOKE INSERT, UPDATE, DELETE ON public.bonus_tournament_draw_presentations FROM anon, authenticated;
GRANT SELECT ON public.bonus_tournament_draw_presentations TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs: service_role only (Edge validates BT_OPERATOR_SECRET)
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
  -- Callable only by service_role (Edge). No browser JWT path.
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

REVOKE ALL ON FUNCTION public.bt_activate_tournament(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_activate_tournament(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bt_activate_tournament(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bt_tournament_cas_write(uuid, bigint, jsonb) TO service_role;

-- Draw CAS already service-oriented; ensure authenticated cannot execute
REVOKE ALL ON FUNCTION public.bt_draw_cas_write(text, bigint, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_draw_cas_write(text, bigint, jsonb, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bt_draw_cas_write(text, bigint, jsonb, boolean) TO service_role;
