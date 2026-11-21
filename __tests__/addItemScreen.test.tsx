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
import { saveBatch, type BatchSaveItem } from '@/lib/wardrobe/addItem';
import { trackItemAdded } from '@/lib/analytics/posthog';
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

describe('Add item -- a batch that fails partway', () => {
  const PHOTOS = ['file://photo-1.jpg', 'file://photo-2.jpg', 'file://photo-3.jpg'];

  type SaveBatchArgs = [string, BatchSaveItem[], (itemId: string) => void];

  /** Mocks one `saveBatch` attempt that reports the first `savedCount` items saved, then throws `error`. */
  function failAfter(savedCount: number, error: Error) {
    (saveBatch as jest.Mock).mockImplementationOnce(async (...[, items, onItemSaved]: SaveBatchArgs) => {
      items.slice(0, savedCount).forEach((item) => onItemSaved(item.itemId));
      throw error;
    });
  }

  function succeed() {
    (saveBatch as jest.Mock).mockImplementationOnce(async (...[, items, onItemSaved]: SaveBatchArgs) => {
      items.forEach((item) => onItemSaved(item.itemId));
    });
  }

  async function renderWithPhotos() {
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <AddItem />
      </QueryClientProvider>,
    );
    const onTransitionEnd = mockAddListener.mock.calls[0][1];
    await act(async () => onTransitionEnd({ data: { closing: false } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save all' })).toBeEnabled());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (saveBatch as jest.Mock).mockReset();
    mockAddListener.mockReturnValue(() => {});
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(1));
    (pickFromLibrary as jest.Mock).mockResolvedValue({ uris: PHOTOS });
    (processWardrobePhoto as jest.Mock).mockImplementation(async (uri: string) => ({
      cutoutUri: uri.replace('photo', 'cutout'),
      thumbUri: uri.replace('photo', 'thumb'),
      colorHex: null,
    }));
  });

  it('keeps the saved item locked, reports the count, and offers Save remaining', async () => {
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    await renderWithPhotos();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Save all' }));

    expect(await screen.findByText('Saved 1 of 3. No connection — the rest are still here. Try again.')).toBeTruthy();
    expect(screen.getAllByLabelText('Saved')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save remaining' })).toBeEnabled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('adds the count to the generic error for a non-connection failure', async () => {
    failAfter(1, new Error('boom'));
    await renderWithPhotos();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Save all' }));

    expect(await screen.findByText('Saved 1 of 3. Something went wrong. Please try again.')).toBeTruthy();
  });

  it('keeps the existing copy and label when nothing saved', async () => {
    failAfter(0, new WardrobeItemError('no_connection', 'offline'));
    await renderWithPhotos();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Save all' }));

    expect(await screen.findByText('No connection — nothing was lost. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save all' })).toBeEnabled();
    expect(screen.queryByLabelText('Saved')).toBeNull();
  });

  it('retries only the unsaved items, then closes the screen', async () => {
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    succeed();
    await renderWithPhotos();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Save all' }));
    await user.press(await screen.findByRole('button', { name: 'Save remaining' }));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());
    const [firstItems, retryItems] = (saveBatch as jest.Mock).mock.calls.map((call) => call[1] as BatchSaveItem[]);
    expect(firstItems).toHaveLength(3);
    expect(retryItems.map((item) => item.itemId)).toEqual(firstItems.slice(1).map((item) => item.itemId));
  });

  it('updates the count when the retry fails again', async () => {
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    await renderWithPhotos();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Save all' }));
    await user.press(await screen.findByRole('button', { name: 'Save remaining' }));

    expect(await screen.findByText('Saved 2 of 3. No connection — the rest are still here. Try again.')).toBeTruthy();
    expect(screen.getAllByLabelText('Saved')).toHaveLength(2);
  });

  it('tracks each item once, as it saves, with the batch size from the first tap', async () => {
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    succeed();
    await renderWithPhotos();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Save all' }));
    await screen.findByRole('button', { name: 'Save remaining' });
    expect(trackItemAdded).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'Save remaining' }));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());
    expect(trackItemAdded).toHaveBeenCalledTimes(3);
    expect((trackItemAdded as jest.Mock).mock.calls.every(([, , batchSize]) => batchSize === 3)).toBe(true);
  });

  it('closes the screen when the last unsaved item is removed after a partial save', async () => {
    (pickFromLibrary as jest.Mock).mockResolvedValue({ uris: PHOTOS.slice(0, 2) });
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    await renderWithPhotos();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Save all' }));
    await screen.findByRole('button', { name: 'Save remaining' });
    await user.press(screen.getByRole('button', { name: 'Remove' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('Cancel after a partial save closes the screen, leaving the saved item alone', async () => {
    failAfter(1, new WardrobeItemError('no_connection', 'offline'));
    await renderWithPhotos();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Save all' }));
    await screen.findByRole('button', { name: 'Save remaining' });
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(router.back).toHaveBeenCalled();
    expect(saveBatch).toHaveBeenCalledTimes(1);
  });
});
