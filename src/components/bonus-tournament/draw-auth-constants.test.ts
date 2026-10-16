import { describe, expect, it } from 'vitest';
import { DRAW_ADMIN_MAGIC_LINK_PATH, drawAdminMagicLinkRedirectUrl } from './draw-auth-constants';

describe('draw admin magic link', () => {
  it('uses a fixed path (no arbitrary redirect)', () => {
    expect(DRAW_ADMIN_MAGIC_LINK_PATH).toBe('/bonus-tournament');
    expect(drawAdminMagicLinkRedirectUrl('https://example.com')).toBe(
      'https://example.com/bonus-tournament',
    );
    expect(drawAdminMagicLinkRedirectUrl('https://example.com/')).toBe(
      'https://example.com/bonus-tournament',
    );
  });
});
