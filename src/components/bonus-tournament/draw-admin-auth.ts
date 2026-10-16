/**
 * Draw-admin unlock (SORTEIO only) — not a Dashboard-wide login.
 * Server re-validates JWT + app_metadata.bonus_tournament_admin on every command.
 */
import { supabase } from '../../lib/supabase';
import { drawAdminMagicLinkRedirectUrl } from './draw-auth-constants';

export async function getBonusTournamentAdminSession(): Promise<{
  ok: boolean;
  userId?: string;
  email?: string;
  reason?: string;
}> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, reason: error.message };
  const session = data.session;
  if (!session) return { ok: false, reason: 'not_signed_in' };

  const app = session.user.app_metadata ?? {};
  const isAdmin =
    app.bonus_tournament_admin === true || app.bonus_tournament_admin === 'true';

  if (!isAdmin) {
    return {
      ok: false,
      userId: session.user.id,
      email: session.user.email,
      reason: 'missing_app_metadata_admin',
    };
  }
  return { ok: true, userId: session.user.id, email: session.user.email };
}

/** Magic link with fixed redirect path (must match Supabase Auth allowlist). */
export async function requestDrawAdminMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const redirectTo = drawAdminMagicLinkRedirectUrl();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOutDrawAdmin(): Promise<void> {
  await supabase.auth.signOut();
}
