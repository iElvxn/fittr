import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { updateProfile } from '@/lib/profile/updateProfile';
import { supabase } from '@/lib/supabase';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

describe('updateProfile', () => {
  it('trims the display name and omits avatar_path when none is given', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await updateProfile('user-1', { displayName: '  Jane Doe  ' });

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ display_name: 'Jane Doe' });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('includes avatar_path when one is given', async () => {
    const { update } = mockUpdateChain({ error: null });

    await updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: 'user-1/avatar.jpg' });

    expect(update).toHaveBeenCalledWith({
      display_name: 'Jane Doe',
      avatar_path: 'user-1/avatar.jpg',
    });
  });

  it('classifies a no-connection failure', async () => {
    mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(updateProfile('user-1', { displayName: 'Jane Doe' })).rejects.toMatchObject({
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    mockUpdateChain({ error: new Error('boom') });

    await expect(updateProfile('user-1', { displayName: 'Jane Doe' })).rejects.toThrow('boom');
  });
});
