import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn(), push: jest.fn() },
}));
// `validateEmailSignUp` stays real; its module imports the Supabase client.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/analytics/posthog', () => ({ trackSignedUp: jest.fn() }));
jest.mock('@/lib/auth/emailSignUp', () => ({
  ...jest.requireActual('@/lib/auth/emailSignUp'),
  signUpWithEmail: jest.fn(),
}));

import { router } from 'expo-router';
import EmailSignUp from '@/app/(auth)/email-sign-up';
import { signUpWithEmail } from '@/lib/auth/emailSignUp';
import { NO_CONNECTION_MESSAGE, SignUpError } from '@/lib/auth/errors';

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('email-input'), 'a@b.com');
  await user.type(screen.getByTestId('password-input'), 'longenough');
  await user.press(screen.getByText('Create account'));
}

describe('Email sign-up screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // The SIGNED_IN event flips the route guards and `app/index` sends the new
  // account to onboarding (see `rootStack.test.tsx`); the screen navigating
  // too would race it.
  it('does not navigate itself on success', async () => {
    (signUpWithEmail as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await render(<EmailSignUp />);
    await fillAndSubmit(user);

    expect(signUpWithEmail).toHaveBeenCalledWith('a@b.com', 'longenough');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows the duplicate-email notice and stays put', async () => {
    (signUpWithEmail as jest.Mock).mockRejectedValue(new SignUpError('duplicate_email', 'exists'));
    const user = userEvent.setup();

    await render(<EmailSignUp />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/Account already exists/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the connection banner when offline', async () => {
    (signUpWithEmail as jest.Mock).mockRejectedValue(new SignUpError('no_connection', 'network error'));
    const user = userEvent.setup();

    await render(<EmailSignUp />);
    await fillAndSubmit(user);

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
