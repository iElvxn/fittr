import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase';
import { isUserCancellationError } from '@/lib/auth/errors';
import { trackSignedUp } from '@/lib/analytics/posthog';
import { applyProviderDisplayName } from '@/lib/auth/providerDisplayName';
import { isNewAccount } from '@/lib/auth/isNewAccount';

export type GoogleSignInResult = { status: 'success'; isNewUser: boolean } | { status: 'cancelled' };

let configured = false;

function ensureConfigured() {
  if (configured) {
    return;
  }

  // webClientId must be the **Web** OAuth client ID — this is the audience
  // Supabase actually validates via `signInWithIdToken`. iosClientId is
  // required separately on iOS since we don't ship a GoogleService-Info.plist
  // for the native SDK to read it from.
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  configured = true;
}

/**
 * Continue with Google, via Supabase Auth's native `signInWithIdToken` — no
 * custom token-trust logic. Requires an EAS development build (Expo Go
 * cannot host native Google Sign-In).
 */
export async function signUpWithGoogle(): Promise<GoogleSignInResult> {
  ensureConfigured();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let idToken: string | null;
  let givenName: string | null | undefined;
  let familyName: string | null | undefined;
  try {
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { status: 'cancelled' };
    }
    idToken = response.data.idToken;
    givenName = response.data.user.givenName;
    familyName = response.data.user.familyName;
  } catch (error) {
    if (isUserCancellationError(error)) {
      return { status: 'cancelled' };
    }
    throw error;
  }

  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) {
    throw error;
  }

  const isNewUser = isNewAccount(data.user);

  if (isNewUser) {
    const providerNameClaim = [givenName, familyName].filter(Boolean).join(' ').trim();

    // Best-effort only: see the comment in appleSignIn.ts — the profiles
    // row already exists via the auth.users trigger. Only applied for a
    // new account, so a returning user's own display_name edit (Story
    // 1.3) is never silently overwritten on a later sign-in.
    await applyProviderDisplayName(data.user.id, providerNameClaim || null);

    trackSignedUp('google');
  }

  return { status: 'success', isNewUser };
}
