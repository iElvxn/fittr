import { supabase } from '@/lib/supabase';
import { SignUpError, isDuplicateEmailError, isNoConnectionError } from '@/lib/auth/errors';
import { trackSignedUp } from '@/lib/analytics/posthog';

export type EmailValidationError = { field: 'email' | 'password'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inline validation shown before submit — kept intentionally simple (email shape, an 8-char floor). */
export function validateEmailSignUp(email: string, password: string): EmailValidationError | null {
  if (!EMAIL_RE.test(email.trim())) {
    return { field: 'email', message: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { field: 'password', message: 'Password must be at least 8 characters.' };
  }
  return null;
}

/**
 * Email/password sign-up via Supabase Auth's own `signUp` — no custom
 * token-trust logic. Classifies duplicate-email and no-connection failures
 * per the I/O matrix; anything else is rethrown for the caller to show as a
 * generic error. The `profiles` row is created automatically by a database
 * trigger on `auth.users` (see 0001_profiles.sql) — nothing to do here.
 */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new SignUpError('no_connection', error.message);
    }
    if (isDuplicateEmailError(error)) {
      throw new SignUpError('duplicate_email', error.message);
    }
    throw error;
  }

  // Anti-enumeration path: Supabase returns 200 with a user whose
  // `identities` array is empty when the email already belongs to a
  // confirmed account, rather than an error.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new SignUpError('duplicate_email', 'Account already exists.');
  }

  if (!data.user) {
    throw new Error('Sign-up did not return a user.');
  }

  trackSignedUp('email');
}
