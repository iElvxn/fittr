import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { statusCodes } from '@react-native-google-signin/google-signin';

import {
  isDuplicateEmailError,
  isNoConnectionError,
  isUserCancellationError,
} from '@/lib/auth/errors';

describe('isDuplicateEmailError', () => {
  it('recognizes Supabase\'s "already registered" AuthApiError', () => {
    const error = new AuthApiError('User already registered', 400, 'user_already_exists');
    expect(isDuplicateEmailError(error)).toBe(true);
  });

  it('is false for unrelated errors', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    expect(isDuplicateEmailError(error)).toBe(false);
  });
});

describe('isNoConnectionError', () => {
  it('recognizes AuthRetryableFetchError', () => {
    const error = new AuthRetryableFetchError('network error', 0);
    expect(isNoConnectionError(error)).toBe(true);
  });

  it("recognizes React Native's bare fetch-failure TypeError", () => {
    const error = new TypeError('Network request failed');
    expect(isNoConnectionError(error)).toBe(true);
  });

  it('is false for unrelated errors', () => {
    expect(isNoConnectionError(new Error('Some other failure'))).toBe(false);
  });
});

describe('isUserCancellationError', () => {
  it('recognizes an expo-apple-authentication cancellation', () => {
    const error = { code: 'ERR_REQUEST_CANCELED' };
    expect(isUserCancellationError(error)).toBe(true);
  });

  it('recognizes a Google Sign-In cancellation error code', () => {
    const error = { code: statusCodes.SIGN_IN_CANCELLED };
    expect(isUserCancellationError(error)).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isUserCancellationError(new Error('boom'))).toBe(false);
  });
});
