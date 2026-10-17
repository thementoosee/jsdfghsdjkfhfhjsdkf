/** Admin-only synthetic enrollments — twitch_user_id prefix, no Helix / no migration. */

export const BT_TEST_USER_PREFIX = 'bt_test_';

export const BT_TEST_ROSTER: ReadonlyArray<{
  twitchUserId: string;
  displayName: string;
  avatarUrl: string;
}> = [
  {
    twitchUserId: 'bt_test_01',
    displayName: 'TestPlayer01',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T1&background=0f172a&color=f8fafc&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_02',
    displayName: 'TestPlayer02',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T2&background=1e293b&color=fde68a&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_03',
    displayName: 'TestPlayer03',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T3&background=312e81&color=e0e7ff&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_04',
    displayName: 'TestPlayer04',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T4&background=422006&color=fde68a&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_05',
    displayName: 'TestPlayer05',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T5&background=134e4a&color=ccfbf1&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_06',
    displayName: 'TestPlayer06',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T6&background=3f1d4d&color=f5d0fe&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_07',
    displayName: 'TestPlayer07',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T7&background=1e3a5f&color=bfdbfe&size=128&bold=true&format=png',
  },
  {
    twitchUserId: 'bt_test_08',
    displayName: 'TestPlayer08',
    avatarUrl:
      'https://ui-avatars.com/api/?name=T8&background=7c2d12&color=fed7aa&size=128&bold=true&format=png',
  },
];

export function isBtTestTwitchUserId(twitchUserId: string): boolean {
  return String(twitchUserId ?? '').startsWith(BT_TEST_USER_PREFIX);
}
