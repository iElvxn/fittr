import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock('@/lib/auth/emailSignIn', () => ({ signInWithEmail: jest.fn() }));

import { router } from 'expo-router';
import SignIn from '@/app/(auth)/sign-in';
import { signInWithEmail } from '@/lib/auth/emailSignIn';
import { SignUpError, INVALID_CREDENTIALS_MESSAGE, NO_CONNECTION_MESSAGE } from '@/lib/auth/errors';

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('email-input'), 'a@b.com');
  await user.type(screen.getByTestId('password-input'), 'somepassword');
  await user.press(screen.getByText('Sign in'));
}

describe('Sign-in screen error-kind-to-message wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the invalid-credentials message (not the connection banner) on wrong password', async () => {
    (signInWithEmail as jest.Mock).mockRejectedValue(
      new SignUpError('invalid_credentials', 'Invalid login credentials'),
    );
    const user = userEvent.setup();

    await render(<SignIn />);
    await fillAndSubmit(user);

    expect(await screen.findByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(NO_CONNECTION_MESSAGE)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the connection banner (not the invalid-credentials message) when offline', async () => {
    (signInWithEmail as jest.Mock).mockRejectedValue(new SignUpError('no_connection', 'network error'));
    const user = userEvent.setup();

    await render(<SignIn />);
    await fillAndSubmit(user);

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(INVALID_CREDENTIALS_MESSAGE)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('routes to the tabs root on success', async () => {
    (signInWithEmail as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await render(<SignIn />);
    await fillAndSubmit(user);

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/index');
  });
});
