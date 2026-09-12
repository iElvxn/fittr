import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';

export type SignUpErrorKind = 'duplicate_email' | 'no_connection' | 'unknown';

export class SignUpError extends Error {
  kind: SignUpErrorKind;

  constructor(kind: SignUpErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'SignUpError';
  }
}

/**
 * The user backed out of / dismissed the native Apple or Google sign-in
 * sheet. Per the I/O matrix this is a normal path, not a failure: no error
 * should be shown, the caller should just return silently to Welcome.
 */
export function isUserCancellationError(error: unknown): boolean {
  // expo-apple-authentication
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
  ) {
    return true;
  }

  // @react-native-google-signin/google-signin
  if (isErrorWithCode(error)) {
    return (
      error.code === statusCodes.SIGN_IN_CANCELLED ||
      error.code === statusCodes.IN_PROGRESS
    );
  }

  return false;
}

/** No network connectivity during a sign-up attempt (any of the three methods). */
export function isNoConnectionError(error: unknown): boolean {
  if (error instanceof AuthRetryableFetchError) {
    return true;
  }

  if (error instanceof TypeError) {
    // React Native's fetch throws a bare TypeError for network failures.
    return /network request failed/i.test(error.message);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return /network|fetch failed|network request failed/i.test(
      String((error as { message?: unknown }).message ?? ''),
    );
  }

  return false;
}

/**
 * An already-registered email. Supabase surfaces this two ways depending on
 * dashboard config: an explicit 400 error ("User already registered"), or —
 * when email-enumeration protection is on — a 200 response whose `user`
 * has an empty `identities` array. Callers must check both; see
 * `classifyEmailSignUpResponse` below for the second case.
 */
export function isDuplicateEmailError(error: unknown): boolean {
  if (error instanceof AuthApiError) {
    return (
      error.status === 400 &&
      /already registered|already exists/i.test(error.message)
    );
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return /already registered|already exists/i.test(
      String((error as { message?: unknown }).message ?? ''),
    );
  }

  return false;
}

export const DUPLICATE_EMAIL_MESSAGE = 'Account already exists — sign in instead.';
export const NO_CONNECTION_MESSAGE = 'Check your connection and try again.';
