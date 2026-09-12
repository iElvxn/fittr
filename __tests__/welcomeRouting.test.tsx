import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock('@/lib/auth/appleSignIn', () => ({ signUpWithApple: jest.fn() }));
jest.mock('@/lib/auth/googleSignIn', () => ({ signUpWithGoogle: jest.fn() }));

import { router } from 'expo-router';
import Welcome from '@/app/(auth)/welcome';
import { signUpWithApple } from '@/lib/auth/appleSignIn';
import { signUpWithGoogle } from '@/lib/auth/googleSignIn';

describe('Welcome routing on successful sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes a new Apple user to onboarding', async () => {
    (signUpWithApple as jest.Mock).mockResolvedValue({ status: 'success', isNewUser: true });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText('Sign in with Apple'));

    expect(router.replace).toHaveBeenCalledWith('/onboarding');
  });

  it('routes a returning Apple user to the tabs root', async () => {
    (signUpWithApple as jest.Mock).mockResolvedValue({ status: 'success', isNewUser: false });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText('Sign in with Apple'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('routes a new Google user to onboarding', async () => {
    (signUpWithGoogle as jest.Mock).mockResolvedValue({ status: 'success', isNewUser: true });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText('Continue with Google'));

    expect(router.replace).toHaveBeenCalledWith('/onboarding');
  });

  it('routes a returning Google user to the tabs root', async () => {
    (signUpWithGoogle as jest.Mock).mockResolvedValue({ status: 'success', isNewUser: false });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText('Continue with Google'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
