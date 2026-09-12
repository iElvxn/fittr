const updateMock = jest.fn();
const eqMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '@/lib/supabase';
import { applyProviderDisplayName } from '@/lib/auth/providerDisplayName';

const from = supabase.from as jest.Mock;

describe('applyProviderDisplayName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
    from.mockReturnValue({ update: updateMock });
  });

  it('does nothing when there is no provider name claim', async () => {
    await applyProviderDisplayName('user-1', null);

    expect(from).not.toHaveBeenCalled();
  });

  it('updates display_name when a provider name claim is present', async () => {
    await applyProviderDisplayName('user-1', 'Jane Appleseed');

    expect(from).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ display_name: 'Jane Appleseed' });
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
  });

  it('swallows an update failure rather than throwing (best-effort only)', async () => {
    eqMock.mockRejectedValue(new Error('network blip'));

    await expect(applyProviderDisplayName('user-1', 'Jane Appleseed')).resolves.toBeUndefined();
  });
});
