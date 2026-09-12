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
// tests don't care about real nonce generation.
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-nonce',
  digestStringAsync: jest.fn().mockResolvedValue('hashed-test-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// `@react-native-google-signin/google-signin` is mocked automatically via
// __mocks__/@react-native-google-signin/google-signin.ts (it touches a
// native module at import time, which isn't available under Jest).

import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { signUpWithApple } from '@/lib/auth/appleSignIn';
import { signUpWithGoogle } from '@/lib/auth/googleSignIn';
import { supabase } from '@/lib/supabase';
import { trackSignedUp } from '@/lib/analytics/posthog';
import { applyProviderDisplayName } from '@/lib/auth/providerDisplayName';

const signInWithIdToken = supabase.auth.signInWithIdToken as jest.Mock;

function userWithTimestamps(createdAt: string, lastSignInAt: string) {
  return { id: 'user-1', created_at: createdAt, last_sign_in_at: lastSignInAt, identities: [] };
}

describe('Apple sign-in returning vs. new user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: null,
    });
  });

  it('reports isNewUser: true and tracks signed_up when created_at and last_sign_in_at are close together', async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: userWithTimestamps('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.500Z') },
      error: null,
    });

    const result = await signUpWithApple();

    expect(result).toEqual({ status: 'success', isNewUser: true });
    expect(trackSignedUp).toHaveBeenCalledWith('apple');
    expect(applyProviderDisplayName).toHaveBeenCalled();
  });

  it('reports isNewUser: false, skips signed_up, and skips the display-name upgrade when last_sign_in_at is well after created_at', async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: userWithTimestamps('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z') },
      error: null,
    });

    const result = await signUpWithApple();

    expect(result).toEqual({ status: 'success', isNewUser: false });
    expect(trackSignedUp).not.toHaveBeenCalled();
    expect(applyProviderDisplayName).not.toHaveBeenCalled();
  });
});

describe('Google sign-in returning vs. new user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-id-token', user: { givenName: null, familyName: null } },
    });
  });

  it('reports isNewUser: true and tracks signed_up when created_at and last_sign_in_at are close together', async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: userWithTimestamps('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.500Z') },
      error: null,
    });

    const result = await signUpWithGoogle();

    expect(result).toEqual({ status: 'success', isNewUser: true });
    expect(trackSignedUp).toHaveBeenCalledWith('google');
    expect(applyProviderDisplayName).toHaveBeenCalled();
  });

  it('reports isNewUser: false, skips signed_up, and skips the display-name upgrade when last_sign_in_at is well after created_at', async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: userWithTimestamps('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z') },
      error: null,
    });

    const result = await signUpWithGoogle();

    expect(result).toEqual({ status: 'success', isNewUser: false });
    expect(trackSignedUp).not.toHaveBeenCalled();
    expect(applyProviderDisplayName).not.toHaveBeenCalled();
  });
});
