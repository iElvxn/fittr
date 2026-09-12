jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithIdToken: jest.fn() } },
}));
jest.mock('@/lib/analytics/posthog', () => ({ trackSignedUp: jest.fn() }));
jest.mock('@/lib/auth/providerDisplayName', () => ({ applyProviderDisplayName: jest.fn() }));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));

// expo-crypto's native implementation isn't available under Jest; these
// tests care about cancellation handling, not real nonce generation.
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-nonce',
  digestStringAsync: jest.fn().mockResolvedValue('hashed-test-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// `@react-native-google-signin/google-signin` is mocked automatically via
// __mocks__/@react-native-google-signin/google-signin.ts (it touches a
// native module at import time, which isn't available under Jest).

import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { signUpWithApple } from '@/lib/auth/appleSignIn';
import { signUpWithGoogle } from '@/lib/auth/googleSignIn';
import { supabase } from '@/lib/supabase';
import { trackSignedUp } from '@/lib/analytics/posthog';

describe('Apple sign-in cancellation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns { status: "cancelled" } with no error when the user backs out of the sheet', async () => {
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({
      code: 'ERR_REQUEST_CANCELED',
    });

    const result = await signUpWithApple();

    expect(result).toEqual({ status: 'cancelled' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(trackSignedUp).not.toHaveBeenCalled();
  });
});

describe('Google sign-in cancellation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns { status: "cancelled" } when the response type is "cancelled"', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'cancelled', data: null });

    const result = await signUpWithGoogle();

    expect(result).toEqual({ status: 'cancelled' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns { status: "cancelled" } when the SDK throws a SIGN_IN_CANCELLED error', async () => {
    (GoogleSignin.signIn as jest.Mock).mockRejectedValue({ code: statusCodes.SIGN_IN_CANCELLED });

    const result = await signUpWithGoogle();

    expect(result).toEqual({ status: 'cancelled' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});
