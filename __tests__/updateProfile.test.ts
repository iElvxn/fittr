import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { updateProfile } from '@/lib/profile/updateProfile';
import { Sentry } from '@/lib/observability/sentry';
import { supabase } from '@/lib/supabase';

const OLD_AVATAR = 'user-1/avatar-1000.jpg';
const NEW_AVATAR = 'user-1/avatar-2000.jpg';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

function mockRemove(remove: jest.Mock = jest.fn().mockResolvedValue({ data: [], error: null })) {
  (supabase.storage.from as jest.Mock).mockReturnValue({ remove });
  return remove;
}

describe('updateProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trims the display name and omits avatar_path when none is given', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await updateProfile('user-1', { displayName: '  Jane Doe  ' });

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ display_name: 'Jane Doe' });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('includes avatar_path when one is given', async () => {
    const { update } = mockUpdateChain({ error: null });
    mockRemove();

    await updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR });

    expect(update).toHaveBeenCalledWith({
      display_name: 'Jane Doe',
      avatar_path: NEW_AVATAR,
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

  describe('previous avatar cleanup', () => {
    it('deletes the previous avatar file once the row points at the new one', async () => {
      const { eq } = mockUpdateChain({ error: null });
      const remove = mockRemove();

      await updateProfile('user-1', {
        displayName: 'Jane Doe',
        avatarPath: NEW_AVATAR,
        previousAvatarPath: OLD_AVATAR,
      });

      expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
      expect(remove).toHaveBeenCalledWith([OLD_AVATAR]);
      expect(eq.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    });

    it('also deletes a legacy fixed-name avatar.jpg once replaced', async () => {
      mockUpdateChain({ error: null });
      const remove = mockRemove();

      await updateProfile('user-1', {
        displayName: 'Jane Doe',
        avatarPath: NEW_AVATAR,
        previousAvatarPath: 'user-1/avatar.jpg',
      });

      expect(remove).toHaveBeenCalledWith(['user-1/avatar.jpg']);
    });

    it.each([
      ['no new avatar was uploaded', { previousAvatarPath: OLD_AVATAR }],
      ['there was no previous avatar', { avatarPath: NEW_AVATAR }],
      ['the previous avatar is null', { avatarPath: NEW_AVATAR, previousAvatarPath: null }],
      ['the path did not change', { avatarPath: OLD_AVATAR, previousAvatarPath: OLD_AVATAR }],
    ])('deletes nothing when %s', async (_label, avatar) => {
      mockUpdateChain({ error: null });
      const remove = mockRemove();

      await updateProfile('user-1', { displayName: 'Jane Doe', ...avatar });

      expect(remove).not.toHaveBeenCalled();
    });

    it('still succeeds, reporting to Sentry, when the delete returns an error', async () => {
      mockUpdateChain({ error: null });
      const storageError = new Error('storage down');
      mockRemove(jest.fn().mockResolvedValue({ data: null, error: storageError }));

      await expect(
        updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR, previousAvatarPath: OLD_AVATAR }),
      ).resolves.toBeUndefined();

      expect(Sentry.captureException).toHaveBeenCalledWith(storageError);
    });

    it('still succeeds, reporting to Sentry, when the delete rejects', async () => {
      mockUpdateChain({ error: null });
      const thrown = new Error('network');
      mockRemove(jest.fn().mockRejectedValue(thrown));

      await expect(
        updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR, previousAvatarPath: OLD_AVATAR }),
      ).resolves.toBeUndefined();

      expect(Sentry.captureException).toHaveBeenCalledWith(thrown);
    });
  });

  describe('failed save rollback', () => {
    it('deletes the just-uploaded avatar and keeps the previous one when the row update fails', async () => {
      mockUpdateChain({ error: new Error('boom') });
      const remove = mockRemove();

      await expect(
        updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR, previousAvatarPath: OLD_AVATAR }),
      ).rejects.toThrow('boom');

      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith([NEW_AVATAR]);
    });

    it('keeps the just-uploaded avatar on a no-connection failure, since the update may have committed', async () => {
      mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });
      const remove = mockRemove();

      await expect(
        updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR, previousAvatarPath: OLD_AVATAR }),
      ).rejects.toMatchObject({ kind: 'no_connection' });

      // The row may already point at the new file (a lost response), so
      // neither file is touched: an orphan beats a broken avatar.
      expect(remove).not.toHaveBeenCalled();
    });

    it('surfaces the save error, not the cleanup error, when the rollback also fails', async () => {
      mockUpdateChain({ error: new Error('boom') });
      mockRemove(jest.fn().mockRejectedValue(new Error('cleanup failed')));

      await expect(
        updateProfile('user-1', { displayName: 'Jane Doe', avatarPath: NEW_AVATAR }),
      ).rejects.toThrow('boom');
    });

    it('deletes nothing when the row update fails with no new avatar', async () => {
      mockUpdateChain({ error: new Error('boom') });
      const remove = mockRemove();

      await expect(updateProfile('user-1', { displayName: 'Jane Doe', previousAvatarPath: OLD_AVATAR })).rejects.toThrow(
        'boom',
      );

      expect(remove).not.toHaveBeenCalled();
    });
  });
});
