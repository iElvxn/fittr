import { Redirect } from 'expo-router';

import { useIsNewUser, useSession } from '@/lib/auth/useSession';

/**
 * The single routing decision for a session. The root layout holds the
 * splash until the session is read, so `loading` is only a fallback here.
 * A cold start with a stored session is a returning user (no onboarding
 * flag exists yet), so only a brand-new account's first sign-in goes to
 * onboarding.
 */
export default function Index() {
  const { session, loading } = useSession();
  const isNewUser = useIsNewUser();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href={isNewUser ? '/onboarding' : '/(tabs)'} />;
}
