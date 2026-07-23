/*
  # Slots catalog v2

  Extends slots for large-catalog search/import without breaking existing columns.
  - Adds catalog metadata columns
  - pg_trgm + unaccent
  - Derived keys/slug/search_normalized via trigger
  - Unique (provider_key, name_key)
  - search_slots + get_slot_providers RPCs
  - bonus_opening_items.slot_id ON DELETE SET NULL
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS search_normalized text,
  ADD COLUMN IF NOT EXISTS rtp_variants numeric[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_storage_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS mechanics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS feature_buy boolean,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS data_confidence text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS name_key text,
  ADD COLUMN IF NOT EXISTS provider_key text;

CREATE OR REPLACE FUNCTION public.normalize_slot_text(input text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    trim(both ' ' FROM regexp_replace(lower(public.unaccent(coalesce(input, ''))), '\s+', ' ', 'g')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.slots_refresh_derived()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  alias_blob text;
BEGIN
  NEW.name_key := public.normalize_slot_text(NEW.name);
  NEW.provider_key := public.normalize_slot_text(NEW.provider);

  SELECT coalesce(string_agg(public.normalize_slot_text(a), ' '), '')
  INTO alias_blob
  FROM unnest(coalesce(NEW.aliases, '{}'::text[])) AS a;

  NEW.search_normalized := trim(both ' ' FROM concat_ws(
    ' ',
    NEW.name_key,
    NEW.provider_key,
    NULLIF(alias_blob, '')
  ));

  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := trim(both '-' FROM regexp_replace(
      coalesce(NEW.name_key, 'slot') || '-' || coalesce(NEW.provider_key, 'unknown'),
      '[^a-z0-9]+',
      '-',
      'g'
    ));
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slots_refresh_derived ON public.slots;
CREATE TRIGGER trg_slots_refresh_derived
  BEFORE INSERT OR UPDATE ON public.slots
  FOR EACH ROW
  EXECUTE FUNCTION public.slots_refresh_derived();

-- Backfill derived fields for existing rows
UPDATE public.slots
SET name = name
WHERE name_key IS NULL OR search_normalized IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS slots_provider_name_key_uidx
  ON public.slots (provider_key, name_key);

CREATE INDEX IF NOT EXISTS idx_slots_search_normalized_trgm
  ON public.slots USING gin (search_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_slots_provider ON public.slots (provider);
CREATE INDEX IF NOT EXISTS idx_slots_is_active ON public.slots (is_active);
CREATE INDEX IF NOT EXISTS idx_slots_provider_key_name_key
  ON public.slots (provider_key, name_key);

-- Fix opening FK delete behavior
ALTER TABLE public.bonus_opening_items
  DROP CONSTRAINT IF EXISTS bonus_opening_items_slot_id_fkey;

ALTER TABLE public.bonus_opening_items
  ADD CONSTRAINT bonus_opening_items_slot_id_fkey
  FOREIGN KEY (slot_id) REFERENCES public.slots(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.search_slots(q text, lim integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  provider text,
  image_url text,
  aliases text[],
  is_active boolean,
  max_win integer,
  volatility text,
  rtp numeric,
  slug text,
  rank_score numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nq text := public.normalize_slot_text(q);
  tokens text[];
BEGIN
  IF nq IS NULL OR length(nq) < 1 THEN
    RETURN;
  END IF;

  tokens := array_remove(string_to_array(nq, ' '), NULL);
  tokens := array_remove(tokens, '');

  IF coalesce(array_length(tokens, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.provider,
    s.image_url,
    s.aliases,
    s.is_active,
    s.max_win,
    s.volatility,
    s.rtp,
    s.slug,
    (
      CASE WHEN s.name_key = nq THEN 1000 ELSE 0 END +
      CASE WHEN s.name_key LIKE nq || '%' THEN 500 ELSE 0 END +
      CASE WHEN s.search_normalized LIKE nq || '%' THEN 200 ELSE 0 END +
      CASE WHEN EXISTS (
        SELECT 1 FROM unnest(coalesce(s.aliases, '{}'::text[])) al
        WHERE public.normalize_slot_text(al) = nq
      ) THEN 800 ELSE 0 END +
      CASE WHEN EXISTS (
        SELECT 1 FROM unnest(coalesce(s.aliases, '{}'::text[])) al
        WHERE public.normalize_slot_text(al) LIKE '%' || nq || '%'
      ) THEN 300 ELSE 0 END +
      round((similarity(coalesce(s.search_normalized, ''), nq) * 100)::numeric, 2) +
      CASE WHEN s.provider_key = nq THEN 150 ELSE 0 END
    )::numeric AS rank_score
  FROM public.slots s
  WHERE s.is_active = true
    AND s.search_normalized IS NOT NULL
    AND (
      -- every token must appear in search_normalized (non-consecutive words)
      (
        SELECT bool_and(position(tok IN s.search_normalized) > 0)
        FROM unnest(tokens) AS tok
      )
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(s.aliases, '{}'::text[])) al
        WHERE public.normalize_slot_text(al) LIKE '%' || nq || '%'
      )
    )
  ORDER BY
    rank_score DESC,
    s.name ASC
  LIMIT GREATEST(1, LEAST(coalesce(lim, 20), 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_slot_providers()
RETURNS TABLE (provider text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT s.provider
  FROM public.slots s
  WHERE s.is_active = true
    AND s.provider IS NOT NULL
    AND length(trim(s.provider)) > 0
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_slot_text(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_slots(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_slot_providers() TO anon, authenticated, service_role;
