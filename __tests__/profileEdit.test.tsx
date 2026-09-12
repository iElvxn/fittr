import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}));
jest.mock('@/lib/profile/avatar', () => ({
  pickAvatar: jest.fn(),
  uploadAvatar: jest.fn(),
}));
jest.mock('@/lib/profile/updateProfile', () => ({
  updateProfile: jest.fn(),
}));

import Profile from '@/app/(tabs)/profile';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/auth/useSession';
import { pickAvatar, uploadAvatar } from '@/lib/profile/avatar';
import { updateProfile } from '@/lib/profile/updateProfile';
import { SignUpError, NO_CONNECTION_MESSAGE } from '@/lib/auth/errors';

let queryClient: QueryClient;

function renderProfile() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Profile />
    </QueryClientProvider>,
  );
}

describe('Profile edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    (useSession as jest.Mock).mockReturnValue({
      session: { user: { id: 'user-1' } },
      loading: false,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValue({ data: { display_name: 'Test User', avatar_path: null }, error: null }),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('shows view mode with an Edit button by default', async () => {
    await renderProfile();

    expect(await screen.findByText('Test User')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.queryByTestId('display-name-input')).toBeNull();
  });

  it('saves a changed display name and returns to view mode', async () => {
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));

    const input = screen.getByTestId('display-name-input');
    await user.clear(input);
    await user.type(input, 'New Name');
    await user.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith('user-1', {
        displayName: 'New Name',
        avatarPath: undefined,
      });
    });
    expect(screen.queryByTestId('display-name-input')).toBeNull();
  });

  it('discards changes on Cancel', async () => {
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));

    const input = screen.getByTestId('display-name-input');
    await user.clear(input);
    await user.type(input, 'Discarded Name');
    await user.press(screen.getByText('Cancel'));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(await screen.findByText('Test User')).toBeTruthy();
  });

  it('requires a display name before saving', async () => {
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));

    const input = screen.getByTestId('display-name-input');
    await user.clear(input);
    await user.press(screen.getByText('Save'));

    expect(await screen.findByText('Enter a display name.')).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('discards a picked avatar preview on Cancel without uploading it', async () => {
    (pickAvatar as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));
    await user.press(screen.getByText('Change photo'));
    expect(await screen.findByTestId('avatar-preview')).toBeTruthy();

    await user.press(screen.getByText('Cancel'));

    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByTestId('avatar-preview')).toBeNull();
  });

  it('shows the connection message and stays in edit mode when saving offline', async () => {
    (updateProfile as jest.Mock).mockRejectedValue(new SignUpError('no_connection', 'network error'));
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));
    await user.press(screen.getByText('Save'));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId('display-name-input')).toBeTruthy();
  });

  it('uploads a picked avatar and includes its path on save', async () => {
    (pickAvatar as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    (uploadAvatar as jest.Mock).mockResolvedValue('user-1/avatar.jpg');
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await renderProfile();
    await screen.findByText('Test User');
    await user.press(screen.getByText('Edit'));
    await user.press(screen.getByText('Change photo'));
    await user.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(uploadAvatar).toHaveBeenCalledWith('user-1', 'file://picked.jpg');
      expect(updateProfile).toHaveBeenCalledWith('user-1', {
        displayName: 'Test User',
        avatarPath: 'user-1/avatar.jpg',
      });
    });
  });
});

describe('Profile with an existing saved avatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    (useSession as jest.Mock).mockReturnValue({
      session: { user: { id: 'user-1' } },
      loading: false,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { display_name: 'Test User', avatar_path: 'user-1/avatar.jpg' },
        error: null,
      }),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches a signed URL for the saved avatar path and renders it', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://example.com/signed-avatar' }, error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ createSignedUrl });

    await renderProfile();
    await screen.findByText('Test User');

    await waitFor(() => {
      expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
      expect(createSignedUrl).toHaveBeenCalledWith('user-1/avatar.jpg', expect.any(Number));
    });

    const avatar = await screen.findByTestId('avatar-preview');
    expect(avatar.props.source).toEqual(
      expect.arrayContaining([{ uri: 'https://example.com/signed-avatar' }]),
    );
  });
});
