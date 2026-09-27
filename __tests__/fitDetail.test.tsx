import { ActionSheetIOS } from 'react-native';
import type { ReactElement } from 'react';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
// `FitItemsList` (rendered by this screen as of Story 4.1) transitively
// imports `@/lib/supabase` via `CATEGORY_LABELS`, which loads the real
// `@react-native-async-storage` native module outside app context.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/fits/deleteFit', () => ({ deleteFit: jest.fn(), countFitWearPhotos: jest.fn() }));
jest.mock('@/lib/fits/getFitItems', () => ({ getFitItems: jest.fn() }));
jest.mock('@/lib/fits/toggleFavorite', () => ({ toggleFitFavorite: jest.fn() }));
// The shared invalidation stays real so the tests see every key it touches.
jest.mock('@/lib/fits/markFitWorn', () => ({
  ...jest.requireActual('@/lib/fits/markFitWorn'),
  markFitWornToday: jest.fn(),
  unmarkFitWornToday: jest.fn(),
}));
// The real `markFitWorn` imports the photo module, whose native image modules can't load here.
// Story 5.5: the Worn strip's Add tile and thumbnails use the rest of it.
jest.mock('@/lib/fits/wearPhoto', () => ({
  chooseWearPhotoSource: jest.fn(),
  pickWearPhoto: jest.fn(),
  saveWearPhoto: jest.fn(),
  removeWearPhoto: jest.fn(),
  deleteWearPhotoFiles: jest.fn(),
  useWearPhotoUrls: jest.fn(),
}));
jest.mock('@/lib/fits/fitWearPhotos', () => ({ useFitWearPhotos: jest.fn() }));
// Pins "today" to Sun Sep 27 2026 without faking timers, as `home.test.tsx` does.
jest.mock('@/lib/fits/localDate', () => ({
  ...jest.requireActual('@/lib/fits/localDate'),
  todayLocalDate: () => '2026-09-27',
}));
jest.mock('@/lib/analytics/posthog', () => ({ trackFitWorn: jest.fn() }));
jest.mock('@/lib/fits/wornFitIds', () => ({ useTodayWornFitIds: jest.fn() }));
jest.mock('@/lib/fits/shareFit', () => ({ shareFitCover: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import FitDetail from '@/app/fit/[id]';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { countFitWearPhotos, deleteFit } from '@/lib/fits/deleteFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { useFitWearPhotos, type FitWearPhoto } from '@/lib/fits/fitWearPhotos';
import { chooseWearPhotoSource, pickWearPhoto, saveWearPhoto, useWearPhotoUrls } from '@/lib/fits/wearPhoto';
import { shareFitCover } from '@/lib/fits/shareFit';
import { Sentry } from '@/lib/observability/sentry';
import { trackFitWorn } from '@/lib/analytics/posthog';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import type { FitRow } from '@/lib/fits/listFits';

let queryClient: QueryClient;

// Mirrors `app/fit/[id].tsx`'s own formatter (not exported, it's a route
// file) -- deriving the expected string this way, rather than hardcoding
// one, keeps the assertion correct regardless of the test runner's own
// timezone, since the component formats in the viewer's local time.
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function makeFit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-1',
    name: 'Weekend Look',
    cover_path: 'user-1/fits/fit-1/cover.png',
    canvas_background_color: null,
    updated_at: '2026-09-18T00:00:00.000Z',
    is_favorite: false,
    ...overrides,
  };
}

function mockActionSheetChoice(buttonIndex: number) {
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(buttonIndex));
}

function renderFitDetail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <FitDetail />
    </QueryClientProvider>,
  );
}

describe('Fit detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'fit-1' });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useFits as jest.Mock).mockReturnValue({
      data: [makeFit()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/fits/fit-1/cover.png': 'https://signed.example/cover.png' },
    });
    (getFitItems as jest.Mock).mockResolvedValue([
      {
        id: 'placement-1',
        wardrobeItemId: 'wardrobe-item-1',
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        zIndex: 1,
        category: 'top',
        wardrobeItemDeleted: false,
        name: 'White Tee',
        thumbPath: 'user-1/items/wardrobe-item-1/thumb.webp',
      },
    ]);
    (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map() });
    (countFitWearPhotos as jest.Mock).mockResolvedValue(0);
    (useFitWearPhotos as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: {} });
    (chooseWearPhotoSource as jest.Mock).mockResolvedValue('library');
    (pickWearPhoto as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    (saveWearPhoto as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows the cover image, name, and Edit/Delete controls', async () => {
    await renderFitDetail();

    expect(screen.getByTestId('fit-detail-cover')).toBeTruthy();
    expect(screen.getByText('Weekend Look')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Fit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Fit' })).toBeTruthy();
  });

  it('never puts a shadow on the collage -- DESIGN.md: photography never gets a shadow of its own', async () => {
    await renderFitDetail();

    const coverFrame = screen.getByTestId('fit-detail-cover').parent;
    expect(coverFrame?.props.style?.shadowOpacity).toBeUndefined();
    expect(coverFrame?.props.style?.shadowColor).toBeUndefined();
  });

  it('shows the item list below the collage', async () => {
    await renderFitDetail();

    expect(await screen.findByTestId('fit-items-list')).toBeTruthy();
    expect(screen.getByText('White Tee')).toBeTruthy();
  });

  it("never crops the cover, regardless of its aspect ratio -- it letterboxes within the flexible preview area instead", async () => {
    await renderFitDetail();

    expect(screen.getByTestId('fit-detail-cover').props.contentFit).toBe('contain');
  });

  it("shows the Fit's last-updated date", async () => {
    const updatedAt = '2026-03-05T12:00:00.000Z';
    (useFits as jest.Mock).mockReturnValue({
      data: [makeFit({ updated_at: updatedAt })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderFitDetail();

    expect(screen.getByText(new RegExp(`Updated ${UPDATED_AT_FORMAT.format(new Date(updatedAt))}$`))).toBeTruthy();
  });

  it('adds the live item count to the meta line once it is known (singular)', async () => {
    await renderFitDetail();
    expect(await screen.findByText(/^1 item · Updated /)).toBeTruthy();
  });

  it('pluralizes the item count and excludes deleted items from it', async () => {
    (getFitItems as jest.Mock).mockResolvedValue([
      { id: 'p-1', wardrobeItemId: 'w-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1, category: 'top', wardrobeItemDeleted: false, name: 'A' },
      { id: 'p-2', wardrobeItemId: 'w-2', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 2, category: 'bottom', wardrobeItemDeleted: false, name: 'B' },
      { id: 'p-3', wardrobeItemId: 'w-3', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 3, category: 'shoes', wardrobeItemDeleted: true, name: 'C' },
    ]);
    await renderFitDetail();
    expect(await screen.findByText(/^2 items · Updated /)).toBeTruthy();
  });

  it('shows only the date in the meta line while the item count is still unknown', async () => {
    (getFitItems as jest.Mock).mockReturnValue(new Promise(() => {}));
    await renderFitDetail();
    expect(screen.getByText(/^Updated /)).toBeTruthy();
  });

  it('labels every action with a visible caption, not just an icon', async () => {
    await renderFitDetail();
    // Let `getFitItems` settle so its state update lands inside the test's act scope.
    await screen.findByTestId('fit-items-list');

    expect(screen.getByText('Favorite')).toBeTruthy();
    expect(screen.getByText('Wear today')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('switches the wear caption to "Worn today" once today is logged', async () => {
    (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
    await renderFitDetail();
    // Let `getFitItems` settle so its state update lands inside the test's act scope.
    await screen.findByTestId('fit-items-list');

    expect(screen.getByText('Worn today')).toBeTruthy();
    expect(screen.queryByText('Wear today')).toBeNull();
  });

  it('navigates to the canvas builder with fitId when Edit is pressed', async () => {
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit Fit' }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/new-fit', params: { fitId: 'fit-1' } });
  });

  it('deletes the Fit and navigates back on confirm', async () => {
    (deleteFit as jest.Mock).mockResolvedValue(undefined);
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    await waitFor(() => {
      expect(deleteFit).toHaveBeenCalledWith('fit-1');
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('confirms a plain delete with no photo line when the Fit has no wear photos', async () => {
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    await waitFor(() =>
      expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
        { options: ['Delete', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        expect.any(Function),
      ),
    );
    expect(countFitWearPhotos).toHaveBeenCalledWith('fit-1');
  });

  it("warns in the delete confirmation that the Fit's wear photos go too", async () => {
    (countFitWearPhotos as jest.Mock).mockResolvedValue(3);
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    await waitFor(() =>
      expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Its 3 wear photos will be deleted too.', options: ['Delete', 'Cancel'] }),
        expect.any(Function),
      ),
    );
  });

  it('says "photo" for a single wear photo', async () => {
    (countFitWearPhotos as jest.Mock).mockResolvedValue(1);
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    await waitFor(() =>
      expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Its 1 wear photo will be deleted too.' }),
        expect.any(Function),
      ),
    );
  });

  it("shows the connection error instead of the confirmation when the photo count can't be read offline", async () => {
    (countFitWearPhotos as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
    expect(deleteFit).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports and shows the unknown-error notice, with no confirmation, when the photo count fails otherwise", async () => {
    (countFitWearPhotos as jest.Mock).mockRejectedValue(new Error('boom'));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
    expect(deleteFit).not.toHaveBeenCalled();
  });

  it('ignores a second Delete tap while the photo count is loading', async () => {
    let resolveCount: (count: number) => void = () => {};
    (countFitWearPhotos as jest.Mock).mockReturnValue(new Promise<number>((resolve) => (resolveCount = resolve)));
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(countFitWearPhotos).toHaveBeenCalledTimes(1);
    resolveCount(0);
    await waitFor(() => expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledTimes(1));
  });

  it('does nothing when delete is cancelled in the action sheet', async () => {
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(deleteFit).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a connection error and stays on screen when delete fails offline', async () => {
    (deleteFit as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('reports and shows a generic message for an unknown delete error', async () => {
    (deleteFit as jest.Mock).mockRejectedValue(new Error('boom'));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while the Fits list is loading', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderFitDetail();

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Fit' })).toBeNull();
  });

  it('shows a connection error with retry when the Fits list fails to load', async () => {
    const refetch = jest.fn();
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Network request failed'),
      refetch,
    });
    await renderFitDetail();

    expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a generic message and reports an unexpected list-load failure', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    });

    await renderFitDetail();

    expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('shows a fallback when the cover has no resolved thumbnail yet', async () => {
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });

    await renderFitDetail();

    expect(screen.getByTestId('fit-detail-cover-fallback')).toBeTruthy();
    expect(screen.queryByTestId('fit-detail-cover')).toBeNull();
  });

  it('shows a not-found message when the Fit is missing from the list', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderFitDetail();

    expect(screen.getByText('This Fit is no longer available.')).toBeTruthy();
  });

  it('shows "Fit updated." when returning with fitUpdated=1', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'fit-1', fitUpdated: '1' });

    await renderFitDetail();

    expect(screen.getByText('Fit updated.')).toBeTruthy();
  });

  it('shows no acknowledgement without the fitUpdated param', async () => {
    await renderFitDetail();

    expect(screen.queryByText('Fit updated.')).toBeNull();
  });

  describe('zero-item empty state (Story 3.4)', () => {
    it('shows an empty state with an Add item action instead of the cover when every item has been deleted', async () => {
      (getFitItems as jest.Mock).mockResolvedValue([
        { id: 'placement-1', wardrobeItemId: 'wardrobe-item-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1, category: 'top', wardrobeItemDeleted: true },
      ]);

      await renderFitDetail();

      expect(await screen.findByTestId('fit-detail-empty')).toBeTruthy();
      expect(screen.queryByTestId('fit-detail-cover')).toBeNull();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Add item' }));
      expect(router.push).toHaveBeenCalledWith({ pathname: '/new-fit', params: { fitId: 'fit-1' } });
    });

    it('hides the redundant footer Edit button when the empty state already offers Add item for the same action', async () => {
      (getFitItems as jest.Mock).mockResolvedValue([
        { id: 'placement-1', wardrobeItemId: 'wardrobe-item-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1, category: 'top', wardrobeItemDeleted: true },
      ]);

      await renderFitDetail();

      await screen.findByTestId('fit-detail-empty');
      expect(screen.queryByRole('button', { name: 'Edit Fit' })).toBeNull();
      // Delete stays available -- an empty Fit is still a real Fit a user
      // may want to remove outright, not just refill.
      expect(screen.getByRole('button', { name: 'Delete Fit' })).toBeTruthy();
    });

    it('shows an empty state when a Fit was saved with no items at all', async () => {
      (getFitItems as jest.Mock).mockResolvedValue([]);

      await renderFitDetail();

      expect(await screen.findByTestId('fit-detail-empty')).toBeTruthy();
    });

    it('shows the cover normally when at least one live item remains among deleted ones', async () => {
      (getFitItems as jest.Mock).mockResolvedValue([
        { id: 'placement-1', wardrobeItemId: 'wardrobe-item-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1, category: 'top', wardrobeItemDeleted: true },
        { id: 'placement-2', wardrobeItemId: 'wardrobe-item-2', x: 0.6, y: 0.6, scale: 1, rotation: 0, zIndex: 2, category: 'shoes', wardrobeItemDeleted: false },
      ]);

      await renderFitDetail();

      await waitFor(() => expect(screen.getByTestId('fit-detail-cover')).toBeTruthy());
      expect(screen.queryByTestId('fit-detail-empty')).toBeNull();
    });

    it('fails open on a no-connection item-count error -- keeps showing the cover and Edit/Delete rather than blocking the whole screen for a secondary read', async () => {
      (getFitItems as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));

      await renderFitDetail();

      await waitFor(() => expect(screen.getByTestId('fit-detail-cover')).toBeTruthy());
      expect(screen.getByRole('button', { name: 'Edit Fit' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Delete Fit' })).toBeTruthy();
      expect(screen.queryByText(NO_CONNECTION_MESSAGE)).toBeNull();
      expect(screen.queryByTestId('fit-detail-empty')).toBeNull();
      expect(screen.queryByTestId('fit-items-list')).toBeNull();
    });

    it('fails open and reports an unexpected item-count failure, without blocking the screen', async () => {
      (getFitItems as jest.Mock).mockRejectedValue(new Error('boom'));

      await renderFitDetail();

      await waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
      expect(screen.getByTestId('fit-detail-cover')).toBeTruthy();
      expect(screen.queryByText(UNKNOWN_ERROR_MESSAGE)).toBeNull();
    });
  });

  describe('Favorite (Story 4.2)', () => {
    it('shows an inactive Favorite control when the Fit is not favorited', async () => {
      await renderFitDetail();

      expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeTruthy();
    });

    it('shows an active Favorite control when the Fit is already favorited', async () => {
      (useFits as jest.Mock).mockReturnValue({
        data: [makeFit({ is_favorite: true })],
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      await renderFitDetail();

      expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeTruthy();
    });

    it('toggles favorite on immediately (before the write resolves) and calls toggleFitFavorite', async () => {
      let resolveToggle: () => void;
      (toggleFitFavorite as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveToggle = resolve)));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Add to favorites' }));

      expect(toggleFitFavorite).toHaveBeenCalledWith('fit-1', true);
      // Flips immediately -- DESIGN.md requires no confirmation step and an
      // immediate visual change, not a wait for the write to resolve.
      expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeTruthy();

      resolveToggle!();
      await waitFor(() => {});
    });

    it('toggles favorite off when already favorited', async () => {
      (useFits as jest.Mock).mockReturnValue({
        data: [makeFit({ is_favorite: true })],
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });
      (toggleFitFavorite as jest.Mock).mockResolvedValue(undefined);
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Remove from favorites' }));

      expect(toggleFitFavorite).toHaveBeenCalledWith('fit-1', false);
    });

    it('reverts the optimistic flip and shows a connection error when the write fails offline', async () => {
      (toggleFitFavorite as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Add to favorites' }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeTruthy();
    });

    it('reverts the optimistic flip and reports an unknown error', async () => {
      (toggleFitFavorite as jest.Mock).mockRejectedValue(new Error('boom'));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Add to favorites' }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeTruthy();
    });

    it('ignores a second tap while the first write is still in flight', async () => {
      let resolveToggle: () => void;
      (toggleFitFavorite as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveToggle = resolve)));
      await renderFitDetail();

      const user = userEvent.setup();
      const button = screen.getByRole('button', { name: 'Add to favorites' });
      await user.press(button);
      await user.press(screen.getByRole('button', { name: 'Remove from favorites' }));

      expect(toggleFitFavorite).toHaveBeenCalledTimes(1);

      resolveToggle!();
      await waitFor(() => {});
    });
  });

  describe('Wear today (Story 4.2)', () => {
    it('shows the not-worn-today control when no fit_wears row exists for today', async () => {
      await renderFitDetail();

      expect(screen.getByRole('button', { name: 'Wear today' })).toBeTruthy();
    });

    it('shows the worn-today control when a fit_wears row already exists for today', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });

      await renderFitDetail();

      expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();
    });

    it('marks the Fit worn today and flips immediately (before the write resolves)', async () => {
      let resolveMark: () => void;
      (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveMark = resolve)));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Wear today' }));

      expect(markFitWornToday).toHaveBeenCalledWith('user-1', 'fit-1');
      // Flips immediately -- same reasoning as Favorite's "flips immediately"
      // test. Once the write resolves, the override clears and the button
      // falls back to `useTodayWornFitIds` -- a real refetch would reflect
      // the new row, but this suite mocks that hook statically, so this
      // test only asserts the pre-resolution optimistic state.
      expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();

      resolveMark!();
      await waitFor(() => {});
    });

    it('unmarks the Fit worn today (undo) when already worn today, flipping immediately', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
      let resolveUnmark: () => void;
      (unmarkFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveUnmark = resolve)));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-1');
      expect(screen.getByRole('button', { name: 'Wear today' })).toBeTruthy();

      resolveUnmark!();
      await waitFor(() => {});
    });

    it('undoes a wear without a photo in one tap, with no confirmation', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
      jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
      (unmarkFitWornToday as jest.Mock).mockResolvedValue(undefined);
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-1'));
      expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
    });

    describe('when today’s wear has a photo', () => {
      const WORN_WITH_PHOTO = new Map([
        ['fit-1', { id: 'wear-1', photo: { path: 'user-1/wear-1/p.webp', thumbPath: 'user-1/wear-1/p_thumb.webp', thumbhash: 'h' } }],
      ]);

      it('asks first, and undoes the wear (and so its photo) on confirm', async () => {
        (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: WORN_WITH_PHOTO });
        (unmarkFitWornToday as jest.Mock).mockResolvedValue(undefined);
        mockActionSheetChoice(0);
        await renderFitDetail();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

        expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
          {
            title: "Undo today's wear? Its photo will be deleted.",
            options: ['Undo wear', 'Cancel'],
            destructiveButtonIndex: 0,
            cancelButtonIndex: 1,
          },
          expect.any(Function),
        );
        await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-1'));
      });

      it('leaves the wear and its photo alone on Cancel', async () => {
        (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: WORN_WITH_PHOTO });
        mockActionSheetChoice(1);
        await renderFitDetail();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

        expect(unmarkFitWornToday).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();
      });
    });

    it("tracks fit_worn from detail and refetches every wear read, including the Planner's and the streak", async () => {
      (markFitWornToday as jest.Mock).mockResolvedValue(undefined);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Wear today' }));

      await waitFor(() => expect(trackFitWorn).toHaveBeenCalledWith('detail'));
      for (const key of ['wornFitIds', 'todayWornFitIds', 'fitWearsRange', 'wearDates', 'fitWearPhotos']) {
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, 'user-1'] }));
      }
    });

    it('does not track fit_worn on undo', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
      (unmarkFitWornToday as jest.Mock).mockResolvedValue(undefined);
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalled());
      expect(trackFitWorn).not.toHaveBeenCalled();
    });

    it('does not track fit_worn when the write fails', async () => {
      (markFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Wear today' }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(trackFitWorn).not.toHaveBeenCalled();
    });

    it('reverts the optimistic flip and shows a connection error when marking worn fails offline', async () => {
      (markFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Wear today' }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Wear today' })).toBeTruthy();
    });

    it('reverts the optimistic flip and reports an unknown error when marking worn fails', async () => {
      (markFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Wear today' }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Wear today' })).toBeTruthy();
    });

    it('reverts back to worn-today and shows a connection error when undoing fails offline', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
      (unmarkFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();
    });

    it('reverts back to worn-today and reports an unknown error when undoing fails', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Map([['fit-1', { id: 'wear-1', photo: null }]]) });
      (unmarkFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();
    });

    it('ignores a second tap while the first write is still in flight', async () => {
      let resolveMark: () => void;
      (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveMark = resolve)));
      await renderFitDetail();

      const user = userEvent.setup();
      const button = screen.getByRole('button', { name: 'Wear today' });
      await user.press(button);
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      expect(markFitWornToday).toHaveBeenCalledTimes(1);

      resolveMark!();
      await waitFor(() => {});
    });
  });

  describe('Share (Story 4.3)', () => {
    const SIGNED_COVER_URL = 'https://signed.example/cover.png';

    it('shows an enabled Share control once the cover URL has resolved', async () => {
      await renderFitDetail();
      // Let `getFitItems` settle so its state update lands inside the test's act scope.
      await screen.findByTestId('fit-items-list');

      const share = screen.getByRole('button', { name: 'Share Fit' });
      expect(share.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('disables Share until the cover URL resolves, so a placeholder can never be shared', async () => {
      (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
      await renderFitDetail();
      // Let `getFitItems` settle so its state update lands inside the test's act scope.
      await screen.findByTestId('fit-items-list');

      const share = screen.getByRole('button', { name: 'Share Fit' });
      expect(share.props.accessibilityState?.disabled).toBe(true);

      const user = userEvent.setup();
      await user.press(share);
      expect(shareFitCover).not.toHaveBeenCalled();
    });

    it('hides Share for a Fit with no live items -- its stale cover would show items that no longer exist', async () => {
      (getFitItems as jest.Mock).mockResolvedValue([]);
      await renderFitDetail();

      await screen.findByTestId('fit-detail-empty');
      expect(screen.queryByRole('button', { name: 'Share Fit' })).toBeNull();
    });

    it("shares the Fit's already-rendered cover via its signed URL", async () => {
      (shareFitCover as jest.Mock).mockResolvedValue(undefined);
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      await waitFor(() => expect(shareFitCover).toHaveBeenCalledWith('fit-1', SIGNED_COVER_URL));
      expect(screen.queryByText(NO_CONNECTION_MESSAGE)).toBeNull();
      expect(screen.queryByText(UNKNOWN_ERROR_MESSAGE)).toBeNull();
    });

    it('shows the no-connection message and does not report to Sentry when the download fails offline', async () => {
      (shareFitCover as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('shows a generic message and reports any other share failure', async () => {
      const failure = new Error('UnableToDownload: status 403');
      (shareFitCover as jest.Mock).mockRejectedValue(failure);
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    });

    it('ignores a second tap while the first share is still preparing', async () => {
      let finishShare: () => void = () => {};
      (shareFitCover as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (finishShare = resolve)));
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      expect(shareFitCover).toHaveBeenCalledTimes(1);
      finishShare();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Share Fit' }).props.accessibilityState?.disabled).toBeFalsy());
    });

    it('keeps Share disabled until the live item count is known, so an empty Fit\'s stale cover cannot slip out', async () => {
      (getFitItems as jest.Mock).mockReturnValue(new Promise(() => {}));
      await renderFitDetail();

      expect(screen.getByRole('button', { name: 'Share Fit' }).props.accessibilityState?.disabled).toBe(true);
    });

    it('fails open -- enables Share -- when the item count read fails', async () => {
      (getFitItems as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();

      await waitFor(() => expect(screen.getByRole('button', { name: 'Share Fit' }).props.accessibilityState?.disabled).toBeFalsy());
    });

    it('re-signs a stale cover URL before sharing, so a long-open screen never hands the download an expired link', async () => {
      (shareFitCover as jest.Mock).mockResolvedValue(undefined);
      const refetch = jest.fn().mockResolvedValue({
        isError: false,
        data: { 'user-1/fits/fit-1/cover.png': 'https://signed.example/fresh-cover.png' },
      });
      (useThumbnailUrls as jest.Mock).mockReturnValue({ data: { 'user-1/fits/fit-1/cover.png': SIGNED_COVER_URL }, isStale: true, refetch });
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      await waitFor(() => expect(shareFitCover).toHaveBeenCalledWith('fit-1', 'https://signed.example/fresh-cover.png'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('does not re-sign a still-fresh cover URL', async () => {
      (shareFitCover as jest.Mock).mockResolvedValue(undefined);
      const refetch = jest.fn();
      (useThumbnailUrls as jest.Mock).mockReturnValue({ data: { 'user-1/fits/fit-1/cover.png': SIGNED_COVER_URL }, isStale: false, refetch });
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      await waitFor(() => expect(shareFitCover).toHaveBeenCalledWith('fit-1', SIGNED_COVER_URL));
      expect(refetch).not.toHaveBeenCalled();
    });

    it('shows the no-connection message without reporting when re-signing fails offline', async () => {
      const refetch = jest.fn().mockResolvedValue({ isError: true, error: new TypeError('Network request failed'), data: undefined });
      (useThumbnailUrls as jest.Mock).mockReturnValue({ data: { 'user-1/fits/fit-1/cover.png': SIGNED_COVER_URL }, isStale: true, refetch });
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(shareFitCover).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('disables Delete while a share is preparing', async () => {
      (shareFitCover as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockActionSheetChoice(0);
      await renderFitDetail();
      await screen.findByTestId('fit-items-list');

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Share Fit' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Fit' }).props.accessibilityState?.disabled).toBe(true));
      await user.press(screen.getByRole('button', { name: 'Delete Fit' }));
      expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
      expect(deleteFit).not.toHaveBeenCalled();
    });

    it('disables Share while a delete is in flight', async () => {
      (deleteFit as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockActionSheetChoice(0);
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Share Fit' }).props.accessibilityState?.disabled).toBe(true));
    });
  });

  describe('Worn photos (Story 5.5)', () => {
    const TODAY = '2026-09-27';

    function wearPhoto(id: string, wornOn: string): FitWearPhoto {
      return {
        id,
        wornOn,
        photo: { path: `user-1/${id}/p.webp`, thumbPath: `user-1/${id}/p_thumb.webp`, thumbhash: `hash-${id}` },
      };
    }

    const TODAY_PHOTO = wearPhoto('wear-today', TODAY);
    const SEP_19 = wearPhoto('wear-19', '2026-09-19');
    const SEP_11 = wearPhoto('wear-11', '2026-09-11');
    const ADD_LABEL = 'Add a photo of what you wore today';

    function mockPhotos(photos: FitWearPhoto[], overrides: Record<string, unknown> = {}) {
      (useFitWearPhotos as jest.Mock).mockReturnValue({ data: photos, isLoading: false, isError: false, error: null, ...overrides });
    }

    /** Today's wear of fit-1, `wear-today`, with or without its photo. */
    function mockWornToday(withPhoto: boolean) {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({
        data: new Map([['fit-1', { id: 'wear-today', photo: withPhoto ? TODAY_PHOTO.photo : null }]]),
      });
    }

    /** Each photo tile's date caption, in strip order. */
    function captions() {
      return screen.getAllByTestId('fit-wear-photo').map((tile) => within(tile).getByText(/.+/).props.children);
    }

    async function renderSettled() {
      const result = await renderFitDetail();
      // Let `getFitItems` settle so its state update lands inside the test's act scope.
      await screen.findByTestId('fit-items-list');
      return result;
    }

    function rerenderFitDetail(rerender: (element: ReactElement) => unknown) {
      return rerender(
        <QueryClientProvider client={queryClient}>
          <FitDetail />
        </QueryClientProvider>,
      );
    }

    it('reads the photos of this Fit, for this user', async () => {
      await renderSettled();

      expect(useFitWearPhotos).toHaveBeenCalledWith('user-1', 'fit-1');
    });

    it('shows a "Worn" strip of every photo, newest first, each dated', async () => {
      mockWornToday(true);
      mockPhotos([TODAY_PHOTO, SEP_19, SEP_11]);
      (useWearPhotoUrls as jest.Mock).mockReturnValue({
        data: { [SEP_19.photo.thumbPath]: 'https://signed.example/19.webp' },
      });

      await renderSettled();

      expect(screen.getByText('Worn')).toBeTruthy();
      expect(captions()).toEqual(['Today', 'Sep 19', 'Sep 11']);
      expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();
      // Thumbnails only, all signed in one batch.
      expect(useWearPhotoUrls).toHaveBeenCalledWith([
        TODAY_PHOTO.photo.thumbPath,
        SEP_19.photo.thumbPath,
        SEP_11.photo.thumbPath,
      ]);
      const source = screen.getAllByTestId('fit-wear-photo-image')[1].props.source;
      expect(Array.isArray(source) ? source[0] : source).toMatchObject({
        uri: 'https://signed.example/19.webp',
        cacheKey: SEP_19.photo.thumbPath,
      });
    });

    it('puts "Today" in primary ink and past dates in secondary ink', async () => {
      mockWornToday(true);
      mockPhotos([TODAY_PHOTO, SEP_19]);

      await renderSettled();

      expect(screen.getByText('Today').props.className).toContain('text-ink-primary');
      expect(screen.getByText('Sep 19').props.className).toContain('text-ink-secondary');
    });

    it('adds the year to a photo from another year', async () => {
      mockPhotos([wearPhoto('wear-old', '2025-08-16')]);

      await renderSettled();

      expect(screen.getByText('Aug 16, 2025')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Your photo from Saturday, Aug 16, 2025. Open that day in the Planner' }),
      ).toBeTruthy();
    });

    it('keeps the tiles 108×144 with 12px corners and no shadow', async () => {
      mockPhotos([SEP_19]);

      await renderSettled();

      const frame = screen.getByTestId('fit-wear-photo-image').parent!;
      expect(frame.props.style).toMatchObject({ width: 108, height: 144 });
      expect(frame.props.className).toContain('rounded-md');
      expect(frame.props.style?.shadowOpacity).toBeUndefined();
    });

    it('opens that day in the Planner when a photo is tapped', async () => {
      mockPhotos([SEP_19, SEP_11]);
      await renderSettled();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Your photo from Saturday, Sep 19. Open that day in the Planner' }));

      expect(router.navigate).toHaveBeenCalledWith({ pathname: '/planner', params: { date: '2026-09-19' } });
    });

    it("leads with a dashed Add tile, dated Today, when today's wear has no photo", async () => {
      mockWornToday(false);
      mockPhotos([SEP_19]);

      await renderSettled();

      expect(screen.getByRole('button', { name: ADD_LABEL })).toBeTruthy();
      expect(screen.getByTestId('fit-wear-photo-add').props.className).toContain('border-dashed');
      expect(screen.getByText('Today')).toBeTruthy();
      expect(captions()).toEqual(['Sep 19']);
    });

    it('shows just the Add tile on the first wear', async () => {
      mockWornToday(false);
      mockPhotos([]);

      await renderSettled();

      expect(screen.getByText('Worn')).toBeTruthy();
      expect(screen.getByRole('button', { name: ADD_LABEL })).toBeTruthy();
      expect(screen.queryAllByTestId('fit-wear-photo')).toHaveLength(0);
    });

    it('hides the section with no photos and no wear today', async () => {
      mockPhotos([]);

      await renderSettled();

      expect(screen.queryByText('Worn')).toBeNull();
      expect(screen.queryByTestId('fit-wear-photos-strip')).toBeNull();
    });

    it('never offers Add without a wear today', async () => {
      mockPhotos([SEP_19]);

      await renderSettled();

      expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();
    });

    it('shows 4 skeleton tiles while the photos load', async () => {
      mockPhotos([], { data: undefined, isLoading: true });

      await renderSettled();

      expect(screen.getByText('Worn')).toBeTruthy();
      expect(screen.getAllByTestId('fit-wear-photo-skeleton', { includeHiddenElements: true })).toHaveLength(4);
    });

    describe('when the photos read fails', () => {
      it('hides the photos, reports the error and shows no notice', async () => {
        const error = new Error('boom');
        mockPhotos([], { data: undefined, isError: true, error });

        await renderSettled();

        expect(screen.queryByText('Worn')).toBeNull();
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
        expect(screen.queryByText(UNKNOWN_ERROR_MESSAGE)).toBeNull();
      });

      it('does not report a no-connection failure', async () => {
        mockPhotos([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });

        await renderSettled();

        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(screen.queryByText(NO_CONNECTION_MESSAGE)).toBeNull();
      });

      it("still offers Add when today's wear has no photo", async () => {
        mockWornToday(false);
        mockPhotos([SEP_19], { isError: true, error: new Error('boom') });

        await renderSettled();

        expect(screen.getByRole('button', { name: ADD_LABEL })).toBeTruthy();
        expect(screen.queryAllByTestId('fit-wear-photo')).toHaveLength(0);
      });
    });

    describe('adding a photo', () => {
      it("saves to today's wear, shows it saving, then leads the strip with it", async () => {
        mockWornToday(false);
        mockPhotos([SEP_19]);
        let resolveSave: () => void = () => {};
        (saveWearPhoto as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: ADD_LABEL }));

        await waitFor(() =>
          expect(saveWearPhoto).toHaveBeenCalledWith('user-1', { id: 'wear-today', photo: null }, 'file://picked.jpg'),
        );
        expect(pickWearPhoto).toHaveBeenCalledWith('library');
        const saving = screen.getByLabelText('Saving your photo');
        expect(within(saving).getByText('Saving')).toBeTruthy();
        expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();

        // The refetch that follows sees the saved photo.
        mockWornToday(true);
        mockPhotos([TODAY_PHOTO, SEP_19]);
        await act(async () => resolveSave());

        await waitFor(() => expect(screen.queryByLabelText('Saving your photo')).toBeNull());
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fitWearPhotos', 'user-1'] });
        expect(captions()).toEqual(['Today', 'Sep 19']);
        expect(screen.queryByRole('button', { name: ADD_LABEL })).toBeNull();
      });

      it('shows the no-connection notice and brings the Add tile back when the save fails offline', async () => {
        mockWornToday(false);
        (saveWearPhoto as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: ADD_LABEL }));

        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
        expect(screen.getByRole('button', { name: ADD_LABEL })).toBeTruthy();
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('reports and shows the unknown-error notice when the save fails otherwise', async () => {
        mockWornToday(false);
        const error = new Error('upload failed');
        (saveWearPhoto as jest.Mock).mockRejectedValue(error);
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: ADD_LABEL }));

        expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
      });

      it('blocks the wear toggle and Delete while the save is in flight', async () => {
        mockWornToday(false);
        let resolveSave: () => void = () => {};
        (saveWearPhoto as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: ADD_LABEL }));
        await waitFor(() => expect(saveWearPhoto).toHaveBeenCalled());

        const toggle = screen.getByRole('button', { name: "Remove today's wear entry" });
        const deleteButton = screen.getByRole('button', { name: 'Delete Fit' });
        expect(toggle.props.accessibilityState).toMatchObject({ disabled: true });
        expect(deleteButton.props.accessibilityState).toMatchObject({ disabled: true });
        await user.press(toggle);
        await user.press(deleteButton);
        expect(unmarkFitWornToday).not.toHaveBeenCalled();
        expect(countFitWearPhotos).not.toHaveBeenCalled();

        await act(async () => resolveSave());
      });

      it('ignores the Add tile while a Delete is in flight', async () => {
        mockWornToday(false);
        let resolveCount: (count: number) => void = () => {};
        (countFitWearPhotos as jest.Mock).mockReturnValue(new Promise<number>((resolve) => (resolveCount = resolve)));
        jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: 'Delete Fit' }));
        await waitFor(() => expect(countFitWearPhotos).toHaveBeenCalled());

        const add = screen.getByRole('button', { name: ADD_LABEL });
        expect(add.props.accessibilityState).toMatchObject({ disabled: true });
        await user.press(add);
        expect(chooseWearPhotoSource).not.toHaveBeenCalled();

        await act(async () => resolveCount(0));
      });

      it('clears a failed save notice when another action starts', async () => {
        mockWornToday(false);
        (saveWearPhoto as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        (toggleFitFavorite as jest.Mock).mockResolvedValue(undefined);
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: ADD_LABEL }));
        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();

        await user.press(screen.getByRole('button', { name: 'Add to favorites' }));

        await waitFor(() => expect(toggleFitFavorite).toHaveBeenCalled());
        expect(screen.queryByText(NO_CONNECTION_MESSAGE)).toBeNull();
      });

      it('ignores the Add tile while a wear toggle is in flight', async () => {
        mockPhotos([]);
        let resolveMark: () => void = () => {};
        (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveMark = resolve)));
        const { rerender } = await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: 'Wear today' }));
        // A refetch lands mid-write with today's (photo-less) wear.
        mockWornToday(false);
        await rerenderFitDetail(rerender);

        const add = screen.getByRole('button', { name: ADD_LABEL });
        expect(add.props.accessibilityState).toMatchObject({ disabled: true });
        await user.press(add);
        expect(chooseWearPhotoSource).not.toHaveBeenCalled();

        await act(async () => resolveMark());
      });
    });

    describe("today's photo follows the worn toggle", () => {
      it("drops today's tile at once when today's wear is undone", async () => {
        mockWornToday(true);
        mockPhotos([TODAY_PHOTO, SEP_19]);
        mockActionSheetChoice(0);
        let resolveUnmark: () => void = () => {};
        (unmarkFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveUnmark = resolve)));
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

        await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalled());
        expect(captions()).toEqual(['Sep 19']);

        await act(async () => resolveUnmark());
      });

      it('brings the tile back when the undo fails', async () => {
        mockWornToday(true);
        mockPhotos([TODAY_PHOTO, SEP_19]);
        mockActionSheetChoice(0);
        (unmarkFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        await renderSettled();

        const user = userEvent.setup();
        await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
        expect(captions()).toEqual(['Today', 'Sep 19']);
      });
    });

    it('updates when the photos change elsewhere, e.g. one removed in the Planner', async () => {
      mockPhotos([SEP_19, SEP_11]);
      const { rerender } = await renderSettled();
      expect(captions()).toEqual(['Sep 19', 'Sep 11']);

      mockPhotos([SEP_11]);
      await rerenderFitDetail(rerender);

      expect(captions()).toEqual(['Sep 11']);
    });
  });
});
