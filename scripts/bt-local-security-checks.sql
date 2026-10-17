-- BT Phase 0 security checks (run as postgres on isolated local PG)
BEGIN;

TRUNCATE bonus_tournament_entries, bonus_tournaments CASCADE;

INSERT INTO bonus_tournaments (id, name, chat_command, is_active, is_demo, entries_open, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'A', '!torneio', true, false, true, 'entries'),
  ('22222222-2222-2222-2222-222222222222', 'B', '!outro', false, false, false, 'entries');

INSERT INTO bonus_tournament_entries (tournament_id, twitch_user_id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'twitch_1', 'PlayerOne'),
  ('11111111-1111-1111-1111-111111111111', 'twitch_2', 'PlayerTwo');

-- Duplicate entry must fail
DO $$
BEGIN
  BEGIN
    INSERT INTO bonus_tournament_entries (tournament_id, twitch_user_id, display_name)
    VALUES ('11111111-1111-1111-1111-111111111111', 'twitch_1', 'PlayerOne');
    RAISE EXCEPTION 'expected unique violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- RLS while A is ACTIVE
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM bonus_tournaments;
  IF n <> 1 THEN RAISE EXCEPTION 'anon should see only ACTIVE tournament, got %', n; END IF;
  SELECT count(*) INTO n FROM bonus_tournament_entries;
  IF n <> 2 THEN RAISE EXCEPTION 'anon should see 2 ACTIVE entries, got %', n; END IF;
END $$;

-- anon cannot execute activate
DO $$
BEGIN
  BEGIN
    PERFORM bt_activate_tournament('11111111-1111-1111-1111-111111111111', true);
    RAISE EXCEPTION 'anon should not execute bt_activate_tournament';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' OR SQLERRM ILIKE '%forbidden%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

-- Exclusive ACTIVE via RPC as service_role
SET request.jwt.claim.role = 'service_role';
SELECT id, is_active FROM bt_activate_tournament('22222222-2222-2222-2222-222222222222', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM bonus_tournaments WHERE is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 ACTIVE, got %', n; END IF;
END $$;

-- After switch, anon sees B only (0 entries)
RESET request.jwt.claim.role;
SET ROLE anon;
DO $$
DECLARE n int; name text;
BEGIN
  SELECT count(*) INTO n FROM bonus_tournaments;
  IF n <> 1 THEN RAISE EXCEPTION 'anon should see only ACTIVE after switch, got %', n; END IF;
  SELECT t.name INTO name FROM bonus_tournaments t LIMIT 1;
  IF name <> 'B' THEN RAISE EXCEPTION 'expected ACTIVE B, got %', name; END IF;
  SELECT count(*) INTO n FROM bonus_tournament_entries;
  IF n <> 0 THEN RAISE EXCEPTION 'inactive tournament entries must be hidden, got %', n; END IF;
END $$;
RESET ROLE;

-- CAS version conflict
SET request.jwt.claim.role = 'service_role';
DO $$
DECLARE v bigint;
BEGIN
  SELECT state_version INTO v FROM bonus_tournaments WHERE id = '22222222-2222-2222-2222-222222222222';
  PERFORM bt_tournament_cas_write(
    '22222222-2222-2222-2222-222222222222',
    v,
    jsonb_build_object('status', 'draw', 'entries_open', false)
  );
  BEGIN
    PERFORM bt_tournament_cas_write(
      '22222222-2222-2222-2222-222222222222',
      v,
      jsonb_build_object('status', 'qf')
    );
    RAISE EXCEPTION 'expected version conflict';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%version conflict%' THEN NULL; ELSE RAISE; END IF;
  END;
END $$;

RESET request.jwt.claim.role;
COMMIT;
SELECT 'bt_local_security_checks_ok' AS result;
