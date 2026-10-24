import { render, screen } from '@testing-library/react-native';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  const StackMock = () => <Text>Guarded stack</Text>;
  StackMock.Screen = () => null;
  StackMock.Protected = ({ children }: { children: React.ReactNode }) => children;
  return { Stack: StackMock };
});
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));

import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from '@/components/navigation/RootStack';
import { useSession } from '@/lib/auth/useSession';

const SIGNED_IN = { user: { id: 'user-1' } };

describe('RootNavigator holds the splash until fonts and the session are ready', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the splash and renders no routes while the session is still being read', async () => {
    (useSession as jest.Mock).mockReturnValue({ session: null, loading: true });

    await render(<RootNavigator fontsReady />);

    expect(screen.queryByText('Guarded stack')).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('keeps the splash while fonts are still loading, even with the session read', async () => {
    (useSession as jest.Mock).mockReturnValue({ session: SIGNED_IN, loading: false });

    await render(<RootNavigator fontsReady={false} />);

    expect(screen.queryByText('Guarded stack')).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['signed in', SIGNED_IN],
    ['signed out', null],
  ])('hides the splash and renders the routes once both are ready (%s)', async (_label, session) => {
    (useSession as jest.Mock).mockReturnValue({ session, loading: false });

    await render(<RootNavigator fontsReady />);

    expect(screen.getByText('Guarded stack')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
