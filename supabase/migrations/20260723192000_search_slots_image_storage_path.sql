/*
  # search_slots includes image_storage_path

  Lets autocomplete/UI resolve Storage images without storing full public URLs.
*/

DROP FUNCTION IF EXISTS public.search_slots(text, integer);

CREATE OR REPLACE FUNCTION public.search_slots(q text, lim integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  provider text,
  image_url text,
  image_storage_path text,
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
    s.image_storage_path,
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

GRANT EXECUTE ON FUNCTION public.search_slots(text, integer) TO anon, authenticated, service_role;
