import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionSheetIOS } from 'react-native';

const mockAddListener = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn() },
  useNavigation: () => ({ addListener: mockAddListener }),
}));
jest.mock('expo-camera', () => ({ CameraView: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random()}`) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => ({ session: { user: { id: 'user-1' } }, loading: false }),
}));
jest.mock('@/lib/wardrobe/capture', () => ({ pickFromLibrary: jest.fn() }));
jest.mock('@/lib/wardrobe/rapidCamera', () => ({ ensureCameraPermission: jest.fn(), capturePhoto: jest.fn() }));
jest.mock('@/lib/wardrobe/processImage', () => ({ processWardrobePhoto: jest.fn() }));
jest.mock('@/lib/wardrobe/addItem', () => ({
  ...jest.requireActual('@/lib/wardrobe/addItem'),
  saveBatch: jest.fn(),
}));
jest.mock('@/lib/analytics/posthog', () => ({ trackItemAdded: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { router } from 'expo-router';
import AddItem from '@/app/add-item';
import { saveBatch } from '@/lib/wardrobe/addItem';
import { pickFromLibrary } from '@/lib/wardrobe/capture';
import { WardrobeItemError } from '@/lib/wardrobe/errors';
import { processWardrobePhoto } from '@/lib/wardrobe/processImage';

/** Renders the screen and picks one library photo, up to a ready Save all. */
async function renderWithOnePhoto() {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await render(
    <QueryClientProvider client={queryClient}>
      <AddItem />
    </QueryClientProvider>,
  );

  // The action sheet opens once the modal's transition ends.
  const onTransitionEnd = mockAddListener.mock.calls[0][1];
  await act(async () => onTransitionEnd({ data: { closing: false } }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save all' })).toBeEnabled());
  return invalidate;
}

describe('Add item -- refreshing the Wardrobe grid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddListener.mockReturnValue(() => {});
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(1));
    (pickFromLibrary as jest.Mock).mockResolvedValue({ uris: ['file://photo.jpg'] });
    (processWardrobePhoto as jest.Mock).mockResolvedValue({
      cutoutUri: 'file://cutout.png',
      thumbUri: 'file://thumb.webp',
      colorHex: null,
    });
  });

  it('refreshes the grid after a save', async () => {
    (saveBatch as jest.Mock).mockResolvedValue(undefined);
    const invalidate = await renderWithOnePhoto();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Save all' }));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wardrobeItems', 'user-1'], refetchType: 'active' });
  });

  it('marks the grid stale, without fetching, after a batch fails', async () => {
    (saveBatch as jest.Mock).mockRejectedValue(new WardrobeItemError('no_connection', 'offline'));
    const invalidate = await renderWithOnePhoto();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Save all' }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wardrobeItems', 'user-1'], refetchType: 'none' }),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
