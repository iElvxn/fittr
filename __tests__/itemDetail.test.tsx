import { ActionSheetIOS } from 'react-native';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  // No-op mock, same as fits.test.tsx -- the focus refetch is invoked by hand where tested.
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/wardrobe/listItems', () => ({ useWardrobeItems: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/wardrobe/updateItem', () => ({ updateWardrobeItem: jest.fn() }));
jest.mock('@/lib/wardrobe/deleteItem', () => ({ deleteWardrobeItem: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/wardrobe/itemFits', () => ({ useItemFitIds: jest.fn() }));

import ItemDetail from '@/app/item/[id]';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { updateWardrobeItem } from '@/lib/wardrobe/updateItem';
import { deleteWardrobeItem } from '@/lib/wardrobe/deleteItem';
import { Sentry } from '@/lib/observability/sentry';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { useItemFitIds } from '@/lib/wardrobe/itemFits';
import { FitError } from '@/lib/fits/errors';
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
    // Midday UTC, so the formatted local date is the same day in any test-runner timezone.
    created_at: '2026-09-12T12:00:00.000Z',
    ...overrides,
  };
}

function makeFit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-a',
    name: 'Sunday Market',
    cover_path: null,
    canvas_background_color: null,
    updated_at: '2026-09-20T12:00:00.000Z',
    is_favorite: false,
    ...overrides,
  };
}

function mockItems(items: WardrobeItemRow[]) {
  (useWardrobeItems as jest.Mock).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });
}

function mockItemFitIds(result: { data?: string[]; isError?: boolean; error?: unknown; refetch?: jest.Mock }) {
  (useItemFitIds as jest.Mock).mockReturnValue({
    data: result.data,
    isError: result.isError ?? false,
    error: result.error ?? null,
    refetch: result.refetch ?? jest.fn(),
  });
}

function mockFitsError(error: unknown) {
  (useFits as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true, error });
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
    mockItems([makeItem()]);
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/items/item-1/cutout.png': 'https://signed.example/cutout.png' },
    });
    // useFits' own order (updated_at desc) -- the strip must follow it.
    (useFits as jest.Mock).mockReturnValue({
      data: [
        makeFit({ id: 'fit-c', name: 'Gallery Opening' }),
        makeFit({ id: 'fit-b', name: 'First Cold Day', canvas_background_color: '#DCE8DC' }),
        makeFit({ id: 'fit-a', name: 'Sunday Market' }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockItemFitIds({ data: [] });
  });

  it('shows the cutout, the caption/title/brand heading, notes, and the Edit/Delete action row', async () => {
    await renderItemDetail();

    expect(screen.getByTestId('item-detail-cutout')).toBeTruthy();
    // Name is the display title; the category sits above it as a caption, the brand below.
    expect(screen.getByText('Silk shirt')).toBeTruthy();
    expect(screen.getByTestId('item-detail-category-caption')).toHaveTextContent('Top');
    expect(screen.getByTestId('item-detail-brand')).toHaveTextContent('Everlane');
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.getByText('Dry clean only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit item' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete item' })).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByText('Delete').props.className).toContain('text-destructive');
    // The pre-v2 permanently-disabled placeholder is gone.
    expect(screen.queryByRole('button', { name: 'Create Fit With This' })).toBeNull();
  });

  it('renders an empty photo well when the cutout has no URL', async () => {
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: undefined });
    await renderItemDetail();

    expect(screen.queryByTestId('item-detail-cutout')).toBeNull();
    expect(screen.getByTestId('item-detail-cutout-fallback')).toBeTruthy();
  });

  it('shows the Details rows: color swatch and name, category, brand, and the Added date', async () => {
    await renderItemDetail();

    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByTestId('item-detail-row-color')).toHaveTextContent(/Color.*Black/);
    expect(screen.getByTestId('item-detail-color-dot')).toBeTruthy();
    expect(screen.getByTestId('item-detail-row-category')).toHaveTextContent(/Category.*Top/);
    expect(screen.getByTestId('item-detail-row-brand')).toHaveTextContent(/Brand.*Everlane/);
    expect(screen.getByTestId('item-detail-row-added')).toHaveTextContent(/Added.*Sep 12, 2026/);
  });

  it("formats an older piece's Added date with its year", async () => {
    mockItems([makeItem({ created_at: '2025-03-04T12:00:00.000Z' })]);
    await renderItemDetail();

    expect(screen.getByTestId('item-detail-row-added')).toHaveTextContent(/Mar 4, 2025/);
  });

  it('falls back to the category title for a bare piece, with Color "Not set" and no brand or notes', async () => {
    mockItems([makeItem({ name: null, brand: null, notes: null, color_hex: null })]);
    await renderItemDetail();

    // No name -- the category becomes the title, so no caption repeats it.
    expect(screen.queryByTestId('item-detail-category-caption')).toBeNull();
    expect(screen.getByTestId('item-detail-title')).toHaveTextContent('Top');
    expect(screen.queryByTestId('item-detail-brand')).toBeNull();
    expect(screen.getByTestId('item-detail-row-color')).toHaveTextContent(/Not set/);
    expect(screen.queryByTestId('item-detail-color-dot')).toBeNull();
    expect(screen.queryByTestId('item-detail-row-brand')).toBeNull();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('shows "In N Fits" with each Fit once, in the Fits list order, and opens a Fit on tap', async () => {
    mockItemFitIds({ data: ['fit-a', 'fit-b'] });
    await renderItemDetail();

    expect(screen.getByText('In 2 Fits')).toBeTruthy();
    const tiles = screen.getAllByTestId('item-fits-tile');
    expect(tiles).toHaveLength(2);
    const fitLabels = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .filter((label) => label === 'Sunday Market' || label === 'First Cold Day');
    // useFits order: fit-b (First Cold Day) before fit-a (Sunday Market).
    expect(fitLabels).toEqual(['First Cold Day', 'Sunday Market']);
    // A Fit's canvas color fills its tile.
    expect(tiles[0].props.style).toEqual(expect.arrayContaining([{ backgroundColor: '#DCE8DC' }]));

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sunday Market' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/fit/[id]', params: { id: 'fit-a' } });
  });

  it('shows each Fit cover, signed, contained in its tile', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: [makeFit({ id: 'fit-a', cover_path: 'user-1/fits/fit-a/cover.png' })],
      isLoading: false,
      isError: false,
      error: null,
    });
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: {
        'user-1/items/item-1/cutout.png': 'https://signed.example/cutout.png',
        'user-1/fits/fit-a/cover.png': 'https://signed.example/fit-a-cover.png',
      },
    });
    mockItemFitIds({ data: ['fit-a'] });
    await renderItemDetail();

    const tile = screen.getByTestId('item-fits-tile');
    const image = within(tile).getByTestId('item-fits-cover');
    // expo-image normalizes `source` to an array on the host element.
    expect(image.props.source).toEqual([{ uri: 'https://signed.example/fit-a-cover.png' }]);
    expect(image.props.contentFit).toBe('contain');
  });

  it('refetches the Fits that use the piece on screen focus', async () => {
    const refetch = jest.fn();
    mockItemFitIds({ data: [], refetch });
    await renderItemDetail();

    const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
    onFocus();

    expect(refetch).toHaveBeenCalled();
  });

  it('hides the Fits section and reports to Sentry when the Fits list fails to load', async () => {
    const boom = new Error('boom');
    mockFitsError(boom);
    mockItemFitIds({ data: ['fit-a'] });
    await renderItemDetail();

    expect(screen.queryByText('Fits')).toBeNull();
    expect(screen.queryByText(/^In \d/)).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
  });

  it('hides the Fits section without reporting when the Fits list fails offline', async () => {
    mockFitsError(new TypeError('Network request failed'));
    mockItemFitIds({ data: ['fit-a'] });
    await renderItemDetail();

    expect(screen.queryByText('Fits')).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('uses the singular caption for one Fit', async () => {
    mockItemFitIds({ data: ['fit-c'] });
    await renderItemDetail();

    expect(screen.getByText('In 1 Fit')).toBeTruthy();
  });

  it('drops a Fit that is no longer in the Fits list (deleted) from the strip and the count', async () => {
    mockItemFitIds({ data: ['fit-a', 'fit-deleted'] });
    await renderItemDetail();

    expect(screen.getByText('In 1 Fit')).toBeTruthy();
    expect(screen.getAllByTestId('item-fits-tile')).toHaveLength(1);
  });

  it('shows the empty Fits state when the piece is in no Fit', async () => {
    await renderItemDetail();

    expect(screen.getByText('Fits')).toBeTruthy();
    expect(screen.getByText('Not in a Fit yet.')).toBeTruthy();
    expect(screen.getByText('Put it on the canvas with a few other pieces and save the look.')).toBeTruthy();
    expect(screen.queryByTestId('item-fits-strip')).toBeNull();
  });

  it('hides the whole Fits section and reports to Sentry when the Fits read fails', async () => {
    const boom = new Error('boom');
    mockItemFitIds({ isError: true, error: boom });
    await renderItemDetail();

    expect(screen.queryByText('Fits')).toBeNull();
    expect(screen.queryByText('Not in a Fit yet.')).toBeNull();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
  });

  it('hides the Fits section without reporting a no-connection failure', async () => {
    mockItemFitIds({ isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });
    await renderItemDetail();

    expect(screen.queryByText('Fits')).toBeNull();
    expect(screen.queryByText('Not in a Fit yet.')).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('pins Save and Cancel to the bottom in edit mode, with captioned field labels', async () => {
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit item' }));

    expect(screen.getByTestId('item-detail-edit-bar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    for (const label of ['Category', 'Color', 'Name', 'Brand', 'Notes']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Edit item' })).toBeNull();
  });

  it('exposes accessible labels for every edit-mode control', async () => {
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit item' }));

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
    await user.press(screen.getByRole('button', { name: 'Edit item' }));
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
    expect(screen.getByRole('button', { name: 'Edit item' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a connection error and keeps the in-progress edit selected when saving fails offline', async () => {
    (updateWardrobeItem as jest.Mock).mockRejectedValue(new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE));
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit item' }));
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
    await user.press(screen.getByRole('button', { name: 'Edit item' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('discards edits on cancel', async () => {
    await renderItemDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit item' }));
    await user.press(screen.getByRole('button', { name: 'Shoes' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByTestId('item-detail-row-category')).toHaveTextContent(/Top/);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
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

  it('shows a skeleton, not a spinner, while the wardrobe list is loading', async () => {
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderItemDetail();

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByTestId('item-detail-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit item' })).toBeNull();
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
    mockItems([]);
    await renderItemDetail();

    expect(screen.getByText('This item is no longer in your wardrobe.')).toBeTruthy();
  });
});
