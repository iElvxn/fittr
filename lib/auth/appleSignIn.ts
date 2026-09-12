import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { isUserCancellationError } from '@/lib/auth/errors';
import { trackSignedUp } from '@/lib/analytics/posthog';
import { applyProviderDisplayName } from '@/lib/auth/providerDisplayName';
import { isNewAccount } from '@/lib/auth/isNewAccount';

export type AppleSignInResult = { status: 'success'; isNewUser: boolean } | { status: 'cancelled' };

/**
 * Sign in with Apple, via Supabase Auth's native `signInWithIdToken` — no
 * custom token-trust logic. Apple's flow requires a SHA-256-hashed nonce
 * sent to Apple and the matching raw nonce sent to Supabase.
 */
export async function signUpWithApple(): Promise<AppleSignInResult> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isUserCancellationError(error)) {
      // Normal path, not a failure — return silently to Welcome.
      return { status: 'cancelled' };
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });

  if (error) {
    throw error;
  }

  const isNewUser = isNewAccount(data.user);

  if (isNewUser) {
    const providerNameClaim = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Best-effort only: the profiles row (with a placeholder display_name)
    // already exists via the auth.users trigger. This just upgrades the
    // placeholder to Apple's real name when available — if it fails, the
    // user still has a working account, and onboarding overwrites this
    // regardless. Only applied for a new account: a returning user may
    // have since set their own display_name (Story 1.3), which this must
    // not silently overwrite on every later sign-in.
    await applyProviderDisplayName(data.user.id, providerNameClaim || null);

    trackSignedUp('apple');
  }

  return { status: 'success', isNewUser };
}
