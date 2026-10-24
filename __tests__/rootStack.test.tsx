import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

// A tiny external store standing in for SessionProvider, so a test can flip
// the session mid-render the way a sign-in or remote sign-out would.
type MockSessionState = { session: { user: { id: string } } | null; loading: boolean; isNewUser: boolean };
let mockState: MockSessionState = { session: null, loading: false, isNewUser: false };
const mockListeners = new Set<() => void>();
function mockSetSession(next: Partial<MockSessionState>) {
  mockState = { ...mockState, ...next };
  mockListeners.forEach((listener) => listener());
}

jest.mock('@/lib/auth/useSession', () => {
  const { useSyncExternalStore: useStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  };
  const useState = () => useStore(subscribe, () => mockState);
  return {
    useSession: () => {
      const { session, loading } = useState();
      return { session, loading };
    },
    useIsNewUser: () => useState().isNewUser,
  };
});

import { RootStack } from '@/components/navigation/RootStack';
// Relative on purpose: Jest resolves `@/app/index` to `app.json`.
import Index from '../app/index';

const SIGNED_IN = { user: { id: 'user-1' } };

function stub(label: string) {
  return function StubScreen() {
    return <Text>{label}</Text>;
  };
}

const routes = {
  _layout: RootStack,
  index: Index,
  '(auth)/_layout': () => <Stack />,
  '(auth)/welcome': stub('Welcome screen'),
  '(auth)/sign-in': stub('Sign-in screen'),
  onboarding: stub('Onboarding screen'),
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/index': stub('Home screen'),
  'fit/[id]': stub('Fit screen'),
  'item/[id]': stub('Item screen'),
  'add-item': stub('Add item screen'),
  'new-fit': stub('New fit screen'),
  profile: stub('Profile screen'),
};

describe('RootStack guards and the index routing decision', () => {
  beforeEach(() => {
    mockState = { session: null, loading: false, isNewUser: false };
  });

  it('sends a signed-out cold start to Welcome', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    expect(screen.getByText('Welcome screen')).toBeTruthy();
  });

  it('sends a signed-out deep link to Welcome, not the Fit screen', async () => {
    await renderRouter(routes, { initialUrl: '/fit/abc' });

    expect(screen.getByText('Welcome screen')).toBeTruthy();
    expect(screen.queryByText('Fit screen')).toBeNull();
  });

  it('opens a signed-in deep link directly', async () => {
    mockState = { session: SIGNED_IN, loading: false, isNewUser: false };

    await renderRouter(routes, { initialUrl: '/fit/abc' });

    expect(screen.getByText('Fit screen')).toBeTruthy();
  });

  it('bounces a signed-in deep link to Sign-in back to Home', async () => {
    mockState = { session: SIGNED_IN, loading: false, isNewUser: false };

    await renderRouter(routes, { initialUrl: '/sign-in' });

    expect(screen.getByText('Home screen')).toBeTruthy();
    expect(screen.queryByText('Sign-in screen')).toBeNull();
  });

  it('sends a returning session to Home, never onboarding', async () => {
    mockState = { session: SIGNED_IN, loading: false, isNewUser: false };

    await renderRouter(routes, { initialUrl: '/' });

    expect(screen.getByText('Home screen')).toBeTruthy();
    expect(screen.queryByText('Onboarding screen')).toBeNull();
  });

  it('moves a new sign-up from Welcome straight to onboarding', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('Welcome screen')).toBeTruthy();

    await act(async () => mockSetSession({ session: SIGNED_IN, isNewUser: true }));

    expect(screen.getByText('Onboarding screen')).toBeTruthy();
    expect(screen.queryByText('Home screen')).toBeNull();
  });

  it('moves a returning sign-in from Sign-in straight to Home', async () => {
    await renderRouter(routes, { initialUrl: '/sign-in' });
    expect(screen.getByText('Sign-in screen')).toBeTruthy();

    await act(async () => mockSetSession({ session: SIGNED_IN, isNewUser: false }));

    expect(screen.getByText('Home screen')).toBeTruthy();
  });

  it('lands on Welcome when the session ends while a signed-in screen is open', async () => {
    mockState = { session: SIGNED_IN, loading: false, isNewUser: false };
    await renderRouter(routes, { initialUrl: '/profile' });
    expect(screen.getByText('Profile screen')).toBeTruthy();

    await act(async () => mockSetSession({ session: null }));

    expect(screen.getByText('Welcome screen')).toBeTruthy();
    expect(screen.queryByText('Profile screen')).toBeNull();
  });
});

