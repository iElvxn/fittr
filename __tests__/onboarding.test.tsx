import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
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

import { router } from 'expo-router';
import Onboarding from '@/app/onboarding';
import { useSession } from '@/lib/auth/useSession';
import { pickAvatar, uploadAvatar } from '@/lib/profile/avatar';
import { updateProfile } from '@/lib/profile/updateProfile';
import { SignUpError, NO_CONNECTION_MESSAGE } from '@/lib/auth/errors';

describe('Onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({
      session: { user: { id: 'user-1' } },
      loading: false,
    });
  });

  it('requires a display name before continuing', async () => {
    const user = userEvent.setup();

    await render(<Onboarding />);
    await user.press(screen.getByText('Continue'));

    expect(await screen.findByText('Enter a display name.')).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('saves the display name and routes to the tabs root on success', async () => {
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await render(<Onboarding />);
    await user.type(screen.getByTestId('display-name-input'), 'Jane Doe');
    await user.press(screen.getByText('Continue'));

    expect(updateProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'Jane Doe',
      avatarPath: undefined,
    });
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('shows the connection message and stays on screen when saving offline', async () => {
    (updateProfile as jest.Mock).mockRejectedValue(new SignUpError('no_connection', 'network error'));
    const user = userEvent.setup();

    await render(<Onboarding />);
    await user.type(screen.getByTestId('display-name-input'), 'Jane Doe');
    await user.press(screen.getByText('Continue'));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uploads a picked avatar and includes its path on continue', async () => {
    (pickAvatar as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    (uploadAvatar as jest.Mock).mockResolvedValue('user-1/avatar.jpg');
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();

    await render(<Onboarding />);
    await user.press(screen.getByText('Add a photo'));
    expect(await screen.findByText('Change photo')).toBeTruthy();

    await user.type(screen.getByTestId('display-name-input'), 'Jane Doe');
    await user.press(screen.getByText('Continue'));

    expect(uploadAvatar).toHaveBeenCalledWith('user-1', 'file://picked.jpg');
    expect(updateProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'Jane Doe',
      avatarPath: 'user-1/avatar.jpg',
    });
  });

  it('does nothing when the avatar picker is cancelled', async () => {
    (pickAvatar as jest.Mock).mockResolvedValue({ cancelled: true });
    const user = userEvent.setup();

    await render(<Onboarding />);
    await user.press(screen.getByText('Add a photo'));

    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByText('Change photo')).toBeNull();
  });
});
