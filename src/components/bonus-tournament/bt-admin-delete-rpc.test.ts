import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: supabase-js `.rpc()` returns `{ data, error }` (thenable builder),
 * not a native Promise — chaining `.catch()` throws:
 * `sb.rpc(...).catch is not a function`
 */
describe('bonus-tournament-admin delete rpc handling', () => {
  const adminSrc = readFileSync(
    resolve(__dirname, '../../../supabase/functions/bonus-tournament-admin/index.ts'),
    'utf8',
  );

  it('does not chain .catch onto sb.rpc (delete path)', () => {
    expect(adminSrc).not.toMatch(/\.rpc\([^;]*\)\.catch\s*\(/);
  });

  it('awaits bt_activate_tournament and checks error explicitly on delete', () => {
    const deleteBlock = adminSrc.slice(adminSrc.indexOf("action === 'delete'"));
    expect(deleteBlock).toContain("await sb.rpc('bt_activate_tournament'");
    expect(deleteBlock).toContain('deactivateErr');
    expect(deleteBlock).toContain('deletedRows');
    expect(deleteBlock).toContain("deleted: true");
  });
});
