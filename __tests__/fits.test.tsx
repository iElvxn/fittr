import { act, render, screen, userEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/fits/wornFitIds', () => ({ useFitWearCounts: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
// `FitsGridCell`'s favorite badge (Story 4.2 fast-follow) imports
// `toggleFitFavorite`, which transitively pulls in `@/lib/supabase` and the
// real AsyncStorage native module outside app context -- same reasoning as
// `fitDetail.test.tsx`'s own `@/lib/supabase` mock, one import removed.
jest.mock('@/lib/fits/toggleFavorite', () => ({ toggleFitFavorite: jest.fn() }));
const mockNavigation = { setParams: jest.fn() };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  // No-op mock, same reasoning as `wardrobeGrid.test.tsx`'s -- decouples the
  // focus-triggered refetch from the rest of these tests.
  useFocusEffect: jest.fn(),
  useNavigation: jest.fn(() => mockNavigation),
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import Fits from '@/app/(tabs)/fits';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { useFitWearCounts } from '@/lib/fits/wornFitIds';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { FitError, NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

// Midday UTC, so the local calendar date is the 21st in any test timezone.
const SAVED_AT = '2026-09-21T12:00:00.000Z';
const SAVED_LABEL = `Saved ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(SAVED_AT))}`;

function fit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-1',
    name: 'Weekend Look',
    cover_path: 'user-1/fits/fit-1/cover.png',
    canvas_background_color: null,
    updated_at: SAVED_AT,
    is_favorite: false,
    ...overrides,
  };
}

function mockFits(overrides: Record<string, unknown> = {}) {
  (useFits as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  });
}

function mockWearCounts(overrides: Record<string, unknown> = {}) {
  (useFitWearCounts as jest.Mock).mockReturnValue({
    data: new Map<string, number>(),
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

let queryClient: QueryClient;

// `FitsGridCell`'s favorite badge (Story 4.2 fast-follow) calls
// `useQueryClient()` for real, unlike this screen's own data hooks (all
// mocked above) -- same `QueryClientProvider` wrapper as `fitDetail.test.tsx`'s
// `renderFitDetail`.
function fitsTree() {
  return (
    <QueryClientProvider client={queryClient}>
      <Fits />
    </QueryClientProvider>
  );
}

function renderFits() {
  return render(fitsTree());
}

describe('Fits tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockWearCounts();
  });

  describe('header', () => {
    it('shows the Fit count over the My Fits title', async () => {
      mockFits({ data: [fit({ id: 'a' }), fit({ id: 'b' }), fit({ id: 'c' })] });

      await renderFits();

      expect(screen.getByText('3 Fits')).toBeTruthy();
      expect(screen.getByRole('header', { name: 'My Fits' })).toBeTruthy();
    });

    it('uses the singular for one Fit', async () => {
      mockFits({ data: [fit()] });

      await renderFits();

      expect(screen.getByText('1 Fit')).toBeTruthy();
    });

    it('reserves the count line while loading, without showing a number', async () => {
      mockFits({ data: undefined, isLoading: true });

      await renderFits();

      expect(screen.getByText(' ')).toBeTruthy();
      expect(screen.queryByText(/\d+ Fits?$/)).toBeNull();
    });
  });

  describe('save acknowledgement', () => {
    it('shows the "Fit saved" banner when returning with fitSaved=1', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });
      mockFits({ data: [fit()] });

      await renderFits();

      expect(screen.getByText('Fit saved')).toBeTruthy();
      expect(screen.getByTestId('fits-ack-banner').props.className).toContain('bg-ink-primary');
      expect(screen.getByText('Fit saved').props.className).toContain('text-surface-base');
    });

    it('shows no banner without the fitSaved param', async () => {
      mockFits({ data: [fit()] });

      await renderFits();

      expect(screen.queryByText('Fit saved')).toBeNull();
    });

    it('resets the filter to All so the saved Fit is visible', async () => {
      mockFits({
        data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })],
      });
      mockWearCounts({ data: new Map([['a', 2]]) });

      const { rerender } = await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));
      expect(screen.queryByText('Office Day')).toBeNull();

      (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });
      await act(async () => {
        rerender(fitsTree());
      });

      expect(screen.getByText('Fit saved')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByText('Office Day')).toBeTruthy();
    });

    it("clears the ack via this screen's own navigation, not the global router", async () => {
      jest.useFakeTimers();
      (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });
      mockFits({ data: [] });

      await renderFits();
      jest.advanceTimersByTime(2500);

      // Regression test: a global `router.setParams` call here would clear
      // whatever screen currently has focus rather than this one -- e.g. if
      // the user tapped into a Fit's detail screen before the ack timed
      // out, leaving the banner stuck on this tab forever. Scoping the
      // clear to this route's own `navigation.setParams` avoids that.
      expect(mockNavigation.setParams).toHaveBeenCalledWith({ fitSaved: undefined });
      expect(router.setParams).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('empty state', () => {
    it('invites building a first Fit when there are none, with no chips', async () => {
      mockFits({ data: [] });

      await renderFits();

      expect(await screen.findByText('No Fits yet.')).toBeTruthy();
      expect(screen.getByText('No Fits yet')).toBeTruthy();
      expect(
        screen.getByText("Put pieces from your closet together on the canvas, then save the looks you'd actually wear."),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    });

    it('goes to the builder from "Build your first Fit"', async () => {
      mockFits({ data: [] });

      await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Build your first Fit' }));

      expect(router.push).toHaveBeenCalledWith('/new-fit');
    });
  });

  it('shows a connection error with retry when the list fails to load', async () => {
    const refetch = jest.fn();
    mockFits({ data: undefined, isError: true, error: new TypeError('Network request failed'), refetch });

    await renderFits();

    expect(screen.getByText('No connection — nothing was lost. Try again.')).toBeTruthy();
    expect(screen.queryByText('No Fits yet')).toBeNull();
    expect(screen.queryByText(/\d+ Fits?$/)).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('lists saved Fits by name and navigates to the detail screen on tap', async () => {
    mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });

    await renderFits();

    expect(screen.getByTestId('fits-grid')).toBeTruthy();
    expect(screen.getByText('Weekend Look')).toBeTruthy();
    expect(screen.getByText('Office Day')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: `Weekend Look, ${SAVED_LABEL}` }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/fit/[id]', params: { id: 'a' } });
  });

  describe('meta line', () => {
    it('shows "Worn n×" for a worn Fit and "Saved Mon D" for one never worn', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });
      mockWearCounts({ data: new Map([['a', 3]]) });

      await renderFits();

      expect(screen.getByText('Worn 3×')).toBeTruthy();
      expect(screen.getByText(SAVED_LABEL)).toBeTruthy();
      expect(SAVED_LABEL).toMatch(/21/);
    });

    it('fails open when the wear-count read fails: every tile shows "Saved …" and it is reported', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });
      mockWearCounts({ data: undefined, isError: true, error: new Error('boom') });

      await renderFits();

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.getAllByText(SAVED_LABEL)).toHaveLength(2);
      expect(screen.queryByText(/^Worn /)).toBeNull();
      expect(Sentry.captureException).toHaveBeenCalledWith(new Error('boom'));

      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));
      expect(screen.getByText('Nothing worn yet.')).toBeTruthy();
    });

    it('does not report a no-connection wear-count failure', async () => {
      mockFits({ data: [fit()] });
      mockWearCounts({ data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });

      await renderFits();

      expect(screen.getByText(SAVED_LABEL)).toBeTruthy();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  it('always keeps New Fit reachable even with saved Fits present', async () => {
    mockFits({ data: [fit()] });

    await renderFits();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'New Fit' }));

    expect(router.push).toHaveBeenCalledWith('/new-fit');
  });

  it('refetches when the screen regains focus', async () => {
    const refetch = jest.fn();
    mockFits({ data: [fit()], refetch });

    await renderFits();

    const onFocus = (useFocusEffect as jest.Mock).mock.calls[0][0];
    onFocus();

    expect(refetch).toHaveBeenCalled();
  });

  it('shows a generic message and reports an unexpected list-load failure', async () => {
    mockFits({ data: undefined, isError: true, error: new Error('boom') });

    await renderFits();

    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('shows a placeholder cell for a Fit whose cover has no resolved thumbnail yet', async () => {
    mockFits({ data: [fit({ id: 'a', cover_path: null })] });

    await renderFits();

    expect(screen.getByTestId('fits-grid-thumbnail-fallback')).toBeTruthy();
    expect(screen.queryByTestId('fits-grid-thumbnail-image')).toBeNull();
  });

  describe('loading', () => {
    it('shows a uniform 3:4 skeleton grid, not a bare spinner, while loading', async () => {
      mockFits({ data: undefined, isLoading: true });

      await renderFits();

      expect(screen.getByTestId('fits-grid-skeleton', { includeHiddenElements: true })).toBeTruthy();
      const tiles = screen.getAllByTestId('fits-grid-skeleton-tile', { includeHiddenElements: true });
      expect(tiles).toHaveLength(6);
      for (const tile of tiles) {
        const { width, height } = tile.props.style;
        expect(height / width).toBeCloseTo(4 / 3);
        expect(tile.props.className).toContain('bg-surface-tile');
      }
    });

    it('keeps showing the skeleton while the wear-count query is still in flight, even after Fits itself has loaded', async () => {
      mockFits({ data: [fit({ id: 'a' })] });
      mockWearCounts({ data: undefined, isLoading: true });

      await renderFits();

      expect(screen.getByTestId('fits-grid-skeleton', { includeHiddenElements: true })).toBeTruthy();
    });
  });

  describe('filters', () => {
    it('defaults to All, showing every Fit', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });

      await renderFits();

      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.getByText('Office Day')).toBeTruthy();
    });

    it('narrows to favorited Fits when the Favorites chip is tapped', async () => {
      mockFits({
        data: [
          fit({ id: 'a', name: 'Weekend Look', is_favorite: true }),
          fit({ id: 'b', name: 'Office Day', is_favorite: false }),
        ],
      });

      await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByText('Favorites'));

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.queryByText('Office Day')).toBeNull();
    });

    it('narrows to worn Fits when the Worn chip is tapped', async () => {
      mockFits({
        data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })],
      });
      mockWearCounts({ data: new Map([['a', 1]]) });

      await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.queryByText('Office Day')).toBeNull();
    });

    it('shows the Worn empty state with Show all Fits when nothing has been worn', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' })] });

      await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));

      expect(screen.getByText('Nothing worn yet.')).toBeTruthy();
      expect(
        screen.getByText("Mark a Fit as worn from its page and it shows up here, with how often you've worn it."),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();

      await user.press(screen.getByRole('button', { name: 'Show all Fits' }));

      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByText('Weekend Look')).toBeTruthy();
    });

    it('shows the Favorites empty state with Show all Fits when nothing is favorited', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look', is_favorite: false })] });

      await renderFits();
      const user = userEvent.setup();
      await user.press(screen.getByText('Favorites'));

      expect(screen.getByText('No favorites yet.')).toBeTruthy();
      expect(screen.getByText('Tap the heart on a Fit to keep it here.')).toBeTruthy();

      await user.press(screen.getByRole('button', { name: 'Show all Fits' }));

      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByText('Weekend Look')).toBeTruthy();
    });
  });
});
