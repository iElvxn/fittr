import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { signUpWithEmail, validateEmailSignUp } from '@/lib/auth/emailSignUp';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signUp: jest.fn() },
    from: jest.fn(),
  },
}));
jest.mock('@/lib/analytics/posthog', () => ({ trackSignedUp: jest.fn() }));

import { supabase } from '@/lib/supabase';
import { trackSignedUp } from '@/lib/analytics/posthog';

const signUp = supabase.auth.signUp as jest.Mock;

describe('validateEmailSignUp', () => {
  it('rejects an invalid email', () => {
    expect(validateEmailSignUp('not-an-email', 'longenoughpassword')).toEqual({
      field: 'email',
      message: expect.any(String),
    });
  });

  it('rejects a short password', () => {
    expect(validateEmailSignUp('a@b.com', 'short')).toEqual({
      field: 'password',
      message: expect.any(String),
    });
  });

  it('accepts a valid email + password', () => {
    expect(validateEmailSignUp('a@b.com', 'longenoughpassword')).toBeNull();
  });
});

describe('signUpWithEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks signed_up on success (profile row comes from the auth.users trigger, not here)', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'user-1', identities: [{ id: 'identity-1' }] } },
      error: null,
    });

    await signUpWithEmail('new@example.com', 'longenoughpassword');

    expect(trackSignedUp).toHaveBeenCalledWith('email');
  });

  it('throws a duplicate_email SignUpError on an explicit "already registered" error', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('User already registered', 400, 'user_already_exists'),
    });

    await expect(signUpWithEmail('existing@example.com', 'longenoughpassword')).rejects.toMatchObject({
      kind: 'duplicate_email',
    });
  });

  it('throws a duplicate_email SignUpError on the empty-identities anti-enumeration response', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'user-2', identities: [] } },
      error: null,
    });

    await expect(signUpWithEmail('existing@example.com', 'longenoughpassword')).rejects.toMatchObject({
      kind: 'duplicate_email',
    });
  });

  it('throws a no_connection SignUpError when the network is unreachable', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('network error', 0),
    });

    await expect(signUpWithEmail('a@b.com', 'longenoughpassword')).rejects.toMatchObject({
      kind: 'no_connection',
    });
  });

  it('rethrows unrecognized errors as-is', async () => {
    const weirdError = new Error('some other failure');
    signUp.mockResolvedValue({ data: { user: null }, error: weirdError });

    await expect(signUpWithEmail('a@b.com', 'longenoughpassword')).rejects.toBe(weirdError);
  });
});

