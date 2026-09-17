import { ActionSheetIOS } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/wardrobe/listItems', () => ({ useWardrobeItems: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/wardrobe/updateItem', () => ({ updateWardrobeItem: jest.fn() }));
jest.mock('@/lib/wardrobe/deleteItem', () => ({ deleteWardrobeItem: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import ItemDetail from '@/app/item/[id]';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { updateWardrobeItem } from '@/lib/wardrobe/updateItem';
import { deleteWardrobeItem } from '@/lib/wardrobe/deleteItem';
import { Sentry } from '@/lib/observability/sentry';
import { WardrobeItemError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/wardrobe/errors';
import type { WardrobeItemRow } from '@/lib/wardrobe/listItems';

let queryClient: QueryClient;

function makeItem(overrides: Partial<WardrobeItemRow> = {}): WardrobeItemRow {
  return {
    id: 'item-1',
    category: 'top',
    name: 'Silk shirt',
    brand: 'Everlane',
    notes: 'Dry clean only',
    color_hex: '#0C0A09',
    cutout_path: 'user-1/items/item-1/cutout.png',
    thumb_path: 'user-1/items/item-1/thumb.webp',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockActionSheetChoice(buttonIndex: number) {
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_options, callback) => callback(buttonIndex));
}

function renderItemDetail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ItemDetail />
    </QueryClientProvider>,
  );
}

describe('Item detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'item-1' });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: [makeItem()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/items/item-1/cutout.png': 'https://signed.example/cutout.png' },
    });
  });

  it('shows the cutout, category, color, name/brand/notes, and the Fit placeholder', async () => {
    await renderItemDetail();

    expect(screen.getByTestId('item-detail-cutout')).toBeTruthy();
    // Name is the editorial headline; category/color/brand collapse into one caption line beneath it.
    expect(screen.getByText('Silk shirt')).toBeTruthy();
    expect(screen.getByText('Top  ·  Black  ·  Everlane')).toBeTruthy();
    expect(screen.getByText('Dry clean only')).toBeTruthy();
    expect(screen.getByText('Not in any Fit yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Fit With This' })).toBeDisabled();
  });

  it('exposes accessible labels for every edit-mode control', async () => {
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('button', { name: 'Top' })).toBeTruthy();
    expect(screen.getByLabelText('Black')).toBeTruthy();
    expect(screen.getByLabelText('Item name')).toBeTruthy();
    expect(screen.getByLabelText('Item brand')).toBeTruthy();
    expect(screen.getByLabelText('Item notes')).toBeTruthy();
  });

  it('saves an edit and returns to view mode', async () => {
    (updateWardrobeItem as jest.Mock).mockResolvedValue(undefined);
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    await user.press(screen.getByRole('button', { name: 'Shoes' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateWardrobeItem).toHaveBeenCalledWith('item-1', {
        category: 'shoes',
        colorHex: '#0C0A09',
        name: 'Silk shirt',
        brand: 'Everlane',
        notes: 'Dry clean only',
      });
    });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a connection error and keeps the in-progress edit selected when saving fails offline', async () => {
    (updateWardrobeItem as jest.Mock).mockRejectedValue(new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE));
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    await user.press(screen.getByRole('button', { name: 'Shoes' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    // Block-and-keep: the changed category must still be selected, not reset by the failed save.
    expect(screen.getByRole('button', { name: 'Shoes' }).props.accessibilityState.selected).toBe(true);
  });

  it('reports and shows a generic message for an unknown save error', async () => {
    (updateWardrobeItem as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('discards edits on cancel', async () => {
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    await user.press(screen.getByRole('button', { name: 'Shoes' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Top  ·  Black  ·  Everlane')).toBeTruthy();
    expect(updateWardrobeItem).not.toHaveBeenCalled();
  });

  it('deletes the item and navigates back on confirm', async () => {
    (deleteWardrobeItem as jest.Mock).mockResolvedValue(undefined);
    mockActionSheetChoice(0);
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete item' }));

    await waitFor(() => {
      expect(deleteWardrobeItem).toHaveBeenCalledWith('item-1');
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('does nothing when delete is cancelled in the action sheet', async () => {
    mockActionSheetChoice(1);
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete item' }));

    expect(deleteWardrobeItem).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a connection error and stays on screen when delete fails offline', async () => {
    (deleteWardrobeItem as jest.Mock).mockRejectedValue(
      new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE),
    );
    mockActionSheetChoice(0);
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete item' }));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('reports and shows a generic message for an unknown delete error', async () => {
    (deleteWardrobeItem as jest.Mock).mockRejectedValue(new Error('boom'));
    mockActionSheetChoice(0);
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete item' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while the wardrobe list is loading', async () => {
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderItemDetail();

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('shows a connection error with retry when the wardrobe list fails to load', async () => {
    const refetch = jest.fn();
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Network request failed'),
      refetch,
    });
    await renderItemDetail();

    expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a not-found message when the item is missing from the list', async () => {
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderItemDetail();

    expect(screen.getByText('This item is no longer in your wardrobe.')).toBeTruthy();
  });

  it('omits the category from the caption when the headline already shows it, and always shows color', async () => {
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: [makeItem({ name: null, brand: null, color_hex: null })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderItemDetail();

    // No name -- category becomes the headline, so the caption shouldn't repeat it.
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('No color set')).toBeTruthy();
    expect(screen.queryByText('Top  ·  No color set')).toBeNull();
  });
});
