import { describe, expect, it } from 'vitest';
import { TWITCH_DEFAULT_AVATAR_URL, isMissingOrGenericAvatar } from './TwitchAvatar';

describe('isMissingOrGenericAvatar', () => {
  it('treats empty as missing', () => {
    expect(isMissingOrGenericAvatar('')).toBe(true);
    expect(isMissingOrGenericAvatar(null)).toBe(true);
  });

  it('treats Twitch default CDN as generic', () => {
    expect(isMissingOrGenericAvatar(TWITCH_DEFAULT_AVATAR_URL)).toBe(true);
  });

  it('accepts real profile URLs', () => {
    expect(
      isMissingOrGenericAvatar(
        'https://static-cdn.jtvnw.net/jtv_user_pictures/abc-profile_image-300x300.png',
      ),
    ).toBe(false);
  });
});
