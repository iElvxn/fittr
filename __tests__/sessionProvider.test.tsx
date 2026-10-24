import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';
import { SessionProvider, useIsNewUser, useSession } from '@/lib/auth/useSession';

const onAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const unsubscribe = jest.fn();
let emit: (event: string, session: unknown) => void;

const NEW_USER = { id: 'user-1', created_at: '2026-01-01T00:00:00.000Z', last_sign_in_at: '2026-01-01T00:00:00.500Z' };
const RETURNING_USER = { id: 'user-1', created_at: '2026-01-01T00:00:00.000Z', last_sign_in_at: '2026-02-01T00:00:00.000Z' };

function Reader({ label }: { label: string }) {
  const { session, loading } = useSession();
  const isNewUser = useIsNewUser();
  return (
    <Text testID={label}>
      {loading ? 'loading' : session ? 'signed-in' : 'signed-out'}|{isNewUser ? 'new' : 'returning'}
    </Text>
  );
}

async function renderProvider(queryClient = new QueryClient()) {
  await render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Reader label="a" />
        <Reader label="b" />
        <Reader label="c" />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('SessionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe } } };
    });
  });

  it('subscribes once however many readers mount, and never calls getSession', async () => {
    await renderProvider();

    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('is loading only until INITIAL_SESSION arrives', async () => {
    await renderProvider();
    expect(screen.getByTestId('a')).toHaveTextContent('loading|returning');

    await act(async () => emit('INITIAL_SESSION', { user: RETURNING_USER }));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|returning');
    expect(screen.getByTestId('c')).toHaveTextContent('signed-in|returning');
  });

  it('settles signed-out when INITIAL_SESSION has no session', async () => {
    await renderProvider();

    await act(async () => emit('INITIAL_SESSION', null));

    expect(screen.getByTestId('b')).toHaveTextContent('signed-out|returning');
  });

  it("marks a brand-new account's first SIGNED_IN as a new user", async () => {
    await renderProvider();
    await act(async () => emit('INITIAL_SESSION', null));

    await act(async () => emit('SIGNED_IN', { user: NEW_USER }));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|new');
  });

  it('keeps a returning account off the new-user path', async () => {
    await renderProvider();
    await act(async () => emit('INITIAL_SESSION', null));

    await act(async () => emit('SIGNED_IN', { user: RETURNING_USER }));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|returning');
  });

  it('keeps isNewUser through a token refresh', async () => {
    await renderProvider();
    await act(async () => emit('INITIAL_SESSION', null));
    await act(async () => emit('SIGNED_IN', { user: NEW_USER }));

    await act(async () => emit('TOKEN_REFRESHED', { user: NEW_USER }));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|new');
  });

  // auth-js recovers a stored session with a SIGNED_IN *before*
  // INITIAL_SESSION. An account created moments before its last sign-in
  // still looks "new" by timestamps, but a relaunch is a returning user.
  it('treats a cold-start recovery SIGNED_IN as a returning session, still loading', async () => {
    await renderProvider();

    await act(async () => emit('SIGNED_IN', { user: NEW_USER }));
    expect(screen.getByTestId('a')).toHaveTextContent('loading|returning');

    await act(async () => emit('INITIAL_SESSION', { user: NEW_USER }));
    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|returning');
  });

  it('treats a cold-start INITIAL_SESSION as a returning session even for a recent account', async () => {
    await renderProvider();

    await act(async () => emit('INITIAL_SESSION', { user: NEW_USER }));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-in|returning');
  });

  it('clears the Query cache and isNewUser on SIGNED_OUT', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['items', 'user-1'], [{ id: 'item-1' }]);
    await renderProvider(queryClient);
    await act(async () => emit('INITIAL_SESSION', null));
    await act(async () => emit('SIGNED_IN', { user: NEW_USER }));

    await act(async () => emit('SIGNED_OUT', null));

    expect(screen.getByTestId('a')).toHaveTextContent('signed-out|returning');
    expect(queryClient.getQueryData(['items', 'user-1'])).toBeUndefined();
  });

  it('unsubscribes on unmount', async () => {
    await renderProvider();

    await act(async () => screen.unmount());

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
