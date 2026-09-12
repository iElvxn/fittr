import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: jest.fn() },
  },
}));

import { signInWithEmail } from '@/lib/auth/emailSignIn';
import { supabase } from '@/lib/supabase';

const signInWithPassword = supabase.auth.signInWithPassword as jest.Mock;

describe('signInWithEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves on success', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    await expect(signInWithEmail('a@b.com', 'correctpassword')).resolves.toBeUndefined();
  });

  it('throws an invalid_credentials SignUpError on wrong email/password', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });

    await expect(signInWithEmail('a@b.com', 'wrongpassword')).rejects.toMatchObject({
      kind: 'invalid_credentials',
    });
  });

  it('throws a no_connection SignUpError when the network is unreachable', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('network error', 0),
    });

    await expect(signInWithEmail('a@b.com', 'correctpassword')).rejects.toMatchObject({
      kind: 'no_connection',
    });
  });

  it('rethrows unrecognized errors as-is', async () => {
    const weirdError = new Error('some other failure');
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: weirdError });

    await expect(signInWithEmail('a@b.com', 'correctpassword')).rejects.toBe(weirdError);
  });
});
