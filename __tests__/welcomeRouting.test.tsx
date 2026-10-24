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

// Where a successful sign-in lands (onboarding vs. Home) is decided by the
// route guards plus `app/index` -- see `rootStack.test.tsx`. Welcome itself
// must not navigate, or it would race that decision.
describe('Welcome leaves post-sign-in routing to the guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['Apple', true, 'Sign in with Apple', signUpWithApple],
    ['Apple', false, 'Sign in with Apple', signUpWithApple],
    ['Google', true, 'Continue with Google', signUpWithGoogle],
    ['Google', false, 'Continue with Google', signUpWithGoogle],
  ])('does not navigate after a successful %s sign-in (isNewUser: %s)', async (_provider, isNewUser, label, signIn) => {
    (signIn as jest.Mock).mockResolvedValue({ status: 'success', isNewUser });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText(label));

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('stays on Welcome without an error when the user cancels', async () => {
    (signUpWithApple as jest.Mock).mockResolvedValue({ status: 'cancelled' });
    const user = userEvent.setup();

    await render(<Welcome />);
    await user.press(screen.getByText('Sign in with Apple'));

    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();
  });
});
