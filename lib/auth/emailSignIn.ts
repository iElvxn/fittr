import { supabase } from '@/lib/supabase';
import { SignUpError, isInvalidCredentialsError, isNoConnectionError } from '@/lib/auth/errors';

/**
 * Email/password sign-in via Supabase Auth's own `signInWithPassword` — no
 * custom token-trust logic. Classifies invalid-credentials and no-connection
 * failures per the I/O matrix; anything else is rethrown for the caller to
 * show as a generic error.
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new SignUpError('no_connection', error.message);
    }
    if (isInvalidCredentialsError(error)) {
      throw new SignUpError('invalid_credentials', error.message);
    }
    throw error;
  }
}
