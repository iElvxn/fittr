import { act, render, screen } from '@testing-library/react-native';

// Renders the real root layout so its wiring is covered: SessionProvider
// inside QueryClientProvider, and the splash held on fonts *and* session.
jest.mock('../global.css', () => ({}));
jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
const mockNavigationRef = { current: null };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  const StackMock = () => <Text>Guarded stack</Text>;
  StackMock.Screen = () => null;
  StackMock.Protected = ({ children }: { children: React.ReactNode }) => children;
  return {
    Stack: StackMock,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useNavigationContainerRef: () => mockNavigationRef,
  };
});
jest.mock('@/lib/theme/navigationTheme', () => ({ navigationLightTheme: {}, navigationDarkTheme: {} }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/lib/analytics/posthog', () => ({
  posthog: {},
  identifyAnalyticsUser: jest.fn(),
  resetAnalyticsUser: jest.fn(),
}));
jest.mock('@/lib/observability/sentry', () => ({
  initSentry: jest.fn(),
  navigationIntegration: { registerNavigationContainer: jest.fn() },
  identifySentryUser: jest.fn(),
  Sentry: { wrap: (component: unknown) => component },
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: jest.fn() } } }));
jest.mock('@/lib/query/queryClient', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { createQueryClient: jest.fn(() => new QueryClient()), registerQueryManagers: jest.fn() };
});

import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { navigationIntegration } from '@/lib/observability/sentry';
import { createQueryClient, registerQueryManagers } from '@/lib/query/queryClient';
// Relative on purpose: Jest resolves `@/app/...` index-like paths to `app.json`.
import RootLayout from '../app/_layout';

// Read before any `beforeEach` clears them: both calls run once, at import.
const createQueryClientCalls = (createQueryClient as jest.Mock).mock.calls.length;
const registerQueryManagersCalls = (registerQueryManagers as jest.Mock).mock.calls.length;

let emit: (event: string, session: unknown) => void;

describe('RootLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
  });

  it('holds the splash until INITIAL_SESSION, then renders the routes', async () => {
    (useFonts as jest.Mock).mockReturnValue([true, null]);

    await render(<RootLayout />);
    expect(screen.queryByText('Guarded stack')).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await act(async () => emit('INITIAL_SESSION', null));

    expect(screen.getByText('Guarded stack')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('still hides the splash when fonts fail to load', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('font failed')]);

    await render(<RootLayout />);
    await act(async () => emit('INITIAL_SESSION', { user: { id: 'user-1' } }));

    expect(screen.getByText('Guarded stack')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps the splash while fonts are still loading', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);

    await render(<RootLayout />);
    await act(async () => emit('INITIAL_SESSION', null));

    expect(screen.queryByText('Guarded stack')).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it("registers the router's navigation container with Sentry, so traces split per screen", async () => {
    (useFonts as jest.Mock).mockReturnValue([true, null]);

    await render(<RootLayout />);

    expect(navigationIntegration.registerNavigationContainer).toHaveBeenCalledWith(mockNavigationRef);
  });

  it('builds its client from the factory and registers the managers once, at import', () => {
    expect(createQueryClientCalls).toBe(1);
    expect(registerQueryManagersCalls).toBe(1);
  });
});
