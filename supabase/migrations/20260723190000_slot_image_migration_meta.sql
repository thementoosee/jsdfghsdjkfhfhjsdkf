/*
  # Slot image migration metadata

  Adds tracking columns for the Phase 3 Storage migration.
  Does NOT create the Storage bucket (created separately via dashboard/CLI).

  Status values:
    pending | available_external | migrated | missing
    | invalid | blocked | failed | review_required
*/

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS image_status text,
  ADD COLUMN IF NOT EXISTS image_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_hash text;

ALTER TABLE public.slots
  DROP CONSTRAINT IF EXISTS slots_image_status_check;

ALTER TABLE public.slots
  ADD CONSTRAINT slots_image_status_check
  CHECK (
    image_status IS NULL
    OR image_status IN (
      'pending',
      'available_external',
      'migrated',
      'missing',
      'invalid',
      'blocked',
      'failed',
      'review_required'
    )
  );

CREATE INDEX IF NOT EXISTS idx_slots_image_status
  ON public.slots (image_status);

CREATE INDEX IF NOT EXISTS idx_slots_image_hash
  ON public.slots (image_hash)
  WHERE image_hash IS NOT NULL;

COMMENT ON COLUMN public.slots.image_status IS
  'Image pipeline status: pending, available_external, migrated, missing, invalid, blocked, failed, review_required';
COMMENT ON COLUMN public.slots.image_last_checked_at IS
  'Last time the migration/audit script inspected this slot image';
COMMENT ON COLUMN public.slots.image_hash IS
  'SHA-256 of the migrated WebP bytes (idempotency / dedup)';
