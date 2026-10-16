/** Fixed Auth redirect for draw-admin magic links (must be in Supabase Auth allowlist). */
export const DRAW_ADMIN_MAGIC_LINK_PATH = '/bonus-tournament';

export function drawAdminMagicLinkRedirectUrl(origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${DRAW_ADMIN_MAGIC_LINK_PATH}`;
}
