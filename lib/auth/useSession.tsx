import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { isNewAccount } from '@/lib/auth/isNewAccount';

type SessionState = { session: Session | null; loading: boolean; isNewUser: boolean };

const SessionContext = createContext<SessionState | null>(null);

/**
 * The app's one auth subscription. `onAuthStateChange` emits
 * `INITIAL_SESSION` once startup settles, so no separate `getSession()` is
 * needed, and `loading` is true only until that event -- once per launch,
 * not once per screen.
 *
 * The callback only sets state: Supabase warns that awaiting another
 * Supabase call inside it can deadlock the auth lock.
 *
 * `isNewUser` is decided here, from the user `SIGNED_IN` already carries,
 * because the `Stack.Protected` guards move the router off `(auth)` as soon
 * as the session appears -- before a sign-in handler's own result returns.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ session: null, loading: true, isNewUser: false });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Covers remote sign-out and expiry too, not just Profile's button,
        // so the next user never sees the previous user's cached rows.
        queryClient.clear();
      }
      setState((prev) => {
        // On cold start auth-js recovers a stored session and emits
        // `SIGNED_IN` *before* `INITIAL_SESSION`. Only a `SIGNED_IN` after
        // startup, from signed out, is a real sign-in -- a recovered
        // session is a returning user even if its timestamps look new.
        const settled = !prev.loading || event === 'INITIAL_SESSION';
        const isSignIn = event === 'SIGNED_IN' && !prev.loading && !prev.session && session;
        return {
          session,
          loading: !settled,
          isNewUser: isSignIn ? isNewAccount(session.user) : event === 'SIGNED_OUT' ? false : prev.isNewUser,
        };
      });
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

function useSessionState(): SessionState {
  const state = useContext(SessionContext);
  if (!state) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return state;
}

export function useSession(): { session: Session | null; loading: boolean } {
  const { session, loading } = useSessionState();
  return { session, loading };
}

/** Whether the current session began with a brand-new account's first sign-in. */
export function useIsNewUser(): boolean {
  return useSessionState().isNewUser;
}
