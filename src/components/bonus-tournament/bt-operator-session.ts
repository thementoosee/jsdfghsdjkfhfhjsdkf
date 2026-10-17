/**
 * Operator secret — session only (sessionStorage).
 * Never persist to localStorage / VITE_* / URLs / logs.
 */

const SESSION_KEY = 'bt-operator-secret-session';
export const BT_OPERATOR_SECRET_HEADER = 'X-BT-Operator-Secret';

export function getOperatorSecret(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.sessionStorage.getItem(SESSION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setOperatorSecret(secret: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = secret.trim();
  if (!trimmed) {
    clearOperatorSecret();
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, trimmed);
}

export function clearOperatorSecret(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasOperatorSecret(): boolean {
  return Boolean(getOperatorSecret());
}

/**
 * Clear secret when the tab is closed / navigated away.
 * Soft reloads in the same tab keep sessionStorage (by design).
 * Call clearOperatorSecret() from an explicit "Terminar sessão" control.
 */
export function bindOperatorSecretLifecycle(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onPageHide = (ev: PageTransitionEvent) => {
    if (ev.persisted) return;
    clearOperatorSecret();
  };
  window.addEventListener('pagehide', onPageHide);
  return () => window.removeEventListener('pagehide', onPageHide);
}
