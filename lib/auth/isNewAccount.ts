const NEW_ACCOUNT_THRESHOLD_MS = 2000;

/**
 * `signInWithIdToken` (Apple/Google) is the single entry point for both
 * sign-up and sign-in — Supabase creates the account on first use and just
 * signs in on every later one. Neither timestamp is client-supplied (both
 * come from Postgres/Supabase Auth), so there's no clock-skew risk: on a
 * brand-new account they're equal or a couple milliseconds apart; on a
 * returning sign-in, `last_sign_in_at` is meaningfully newer than
 * `created_at`.
 */
export function isNewAccount(user: { created_at: string; last_sign_in_at?: string | null }): boolean {
  if (!user.last_sign_in_at) {
    return true;
  }
  const createdAt = new Date(user.created_at).getTime();
  const lastSignInAt = new Date(user.last_sign_in_at).getTime();
  return Math.abs(lastSignInAt - createdAt) < NEW_ACCOUNT_THRESHOLD_MS;
}
