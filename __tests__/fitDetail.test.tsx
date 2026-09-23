import { ActionSheetIOS } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
// `FitItemsList` (rendered by this screen as of Story 4.1) transitively
// imports `@/lib/supabase` via `CATEGORY_LABELS`, which loads the real
// `@react-native-async-storage` native module outside app context.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/fits/deleteFit', () => ({ deleteFit: jest.fn() }));
jest.mock('@/lib/fits/getFitItems', () => ({ getFitItems: jest.fn() }));
jest.mock('@/lib/fits/toggleFavorite', () => ({ toggleFitFavorite: jest.fn() }));
jest.mock('@/lib/fits/markFitWorn', () => ({ markFitWornToday: jest.fn(), unmarkFitWornToday: jest.fn() }));
jest.mock('@/lib/fits/wornFitIds', () => ({ useTodayWornFitIds: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import FitDetail from '@/app/fit/[id]';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { Sentry } from '@/lib/observability/sentry';
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
    (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Set() });
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

    expect(screen.getByText(`Updated ${UPDATED_AT_FORMAT.format(new Date(updatedAt))}`)).toBeTruthy();
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
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Set(['fit-1']) });

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
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Set(['fit-1']) });
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
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Set(['fit-1']) });
      (unmarkFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      await renderFitDetail();

      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: "Remove today's wear entry" }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByRole('button', { name: "Remove today's wear entry" })).toBeTruthy();
    });

    it('reverts back to worn-today and reports an unknown error when undoing fails', async () => {
      (useTodayWornFitIds as jest.Mock).mockReturnValue({ data: new Set(['fit-1']) });
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
});
