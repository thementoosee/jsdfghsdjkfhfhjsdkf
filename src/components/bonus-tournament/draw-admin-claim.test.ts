import { describe, expect, it } from 'vitest';

/** Mirrors Edge `isAdminAppMetadata` — only bonus_tournament_admin. */
function isAdminAppMetadata(app: Record<string, unknown> | undefined): boolean {
  if (!app) return false;
  return app.bonus_tournament_admin === true || app.bonus_tournament_admin === 'true';
}

describe('draw admin claim', () => {
  it('accepts only bonus_tournament_admin', () => {
    expect(isAdminAppMetadata({ bonus_tournament_admin: true })).toBe(true);
    expect(isAdminAppMetadata({ bonus_tournament_admin: 'true' })).toBe(true);
  });

  it('rejects role=admin and empty claims', () => {
    expect(isAdminAppMetadata({ role: 'admin' })).toBe(false);
    expect(isAdminAppMetadata({})).toBe(false);
    expect(isAdminAppMetadata(undefined)).toBe(false);
  });
});
