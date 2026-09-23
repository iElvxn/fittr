import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/fits/wornFitIds', () => ({ useWornFitIds: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
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
import { useWornFitIds } from '@/lib/fits/wornFitIds';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { Sentry } from '@/lib/observability/sentry';

function fit(overrides: Partial<FitRow> = {}): FitRow {
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

function mockWornFitIds(overrides: Record<string, unknown> = {}) {
  (useWornFitIds as jest.Mock).mockReturnValue({
    data: new Set<string>(),
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

describe('Fits tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockWornFitIds();
  });

  describe('save acknowledgement', () => {
    it('shows "Fit saved." when returning with fitSaved=1', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });
      mockFits({ data: [] });

      await render(<Fits />);

      expect(screen.getByText('Fit saved.')).toBeTruthy();
    });

    it('shows no acknowledgement without the fitSaved param', async () => {
      mockFits({ data: [] });

      await render(<Fits />);

      expect(screen.queryByText('Fit saved.')).toBeNull();
    });

    it('clears the ack via this screen\'s own navigation, not the global router', async () => {
      jest.useFakeTimers();
      (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });
      mockFits({ data: [] });

      await render(<Fits />);
      jest.advanceTimersByTime(2500);

      // Regression test: a global `router.setParams` call here would clear
      // whatever screen currently has focus rather than this one -- e.g. if
      // the user tapped into a Fit's detail screen before the ack timed
      // out, leaving "Fit saved." stuck on this tab forever. Scoping the
      // clear to this route's own `navigation.setParams` avoids that.
      expect(mockNavigation.setParams).toHaveBeenCalledWith({ fitSaved: undefined });
      expect(router.setParams).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  it('shows the empty state when there are no Fits', async () => {
    mockFits({ data: [] });

    await render(<Fits />);

    expect(await screen.findByText('Build your first Fit.')).toBeTruthy();
  });

  it('shows a connection error with retry when the list fails to load', async () => {
    const refetch = jest.fn();
    mockFits({ data: undefined, isError: true, error: new TypeError('Network request failed'), refetch });

    await render(<Fits />);

    expect(screen.getByText('No connection — nothing was lost. Try again.')).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('lists saved Fits by name and navigates to the detail screen on tap', async () => {
    mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });

    await render(<Fits />);

    expect(screen.getByText('Weekend Look')).toBeTruthy();
    expect(screen.getByText('Office Day')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Weekend Look' }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/fit/[id]', params: { id: 'a' } });
  });

  it('always keeps New Fit reachable even with saved Fits present', async () => {
    mockFits({ data: [fit()] });

    await render(<Fits />);

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'New Fit' }));

    expect(router.push).toHaveBeenCalledWith('/new-fit');
  });

  it('refetches when the screen regains focus', async () => {
    const refetch = jest.fn();
    mockFits({ data: [fit()], refetch });

    await render(<Fits />);

    const onFocus = (useFocusEffect as jest.Mock).mock.calls[0][0];
    onFocus();

    expect(refetch).toHaveBeenCalled();
  });

  it('shows a generic message and reports an unexpected list-load failure', async () => {
    mockFits({ data: undefined, isError: true, error: new Error('boom') });

    await render(<Fits />);

    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('shows a placeholder cell for a Fit whose cover has no resolved thumbnail yet', async () => {
    mockFits({ data: [fit({ id: 'a', cover_path: null })] });

    await render(<Fits />);

    expect(screen.getByTestId('fits-grid-thumbnail-fallback')).toBeTruthy();
    expect(screen.queryByTestId('fits-grid-thumbnail-image')).toBeNull();
  });

  describe('filters', () => {
    it('shows a skeleton grid, not a bare spinner, while loading', async () => {
      mockFits({ data: undefined, isLoading: true });

      await render(<Fits />);

      expect(screen.getByTestId('fits-grid-skeleton', { includeHiddenElements: true })).toBeTruthy();
    });

    it('keeps showing the skeleton while the Worn-status query is still in flight, even after Fits itself has loaded', async () => {
      mockFits({ data: [fit({ id: 'a' })] });
      mockWornFitIds({ data: undefined, isLoading: true });

      await render(<Fits />);

      expect(screen.getByTestId('fits-grid-skeleton', { includeHiddenElements: true })).toBeTruthy();
    });

    it('fails open and reports a Worn-status fetch failure, without blocking the grid', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' })] });
      mockWornFitIds({ data: undefined, isError: true, error: new Error('boom') });

      await render(<Fits />);

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledWith(new Error('boom'));
    });

    it('defaults to All, showing every Fit', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })] });

      await render(<Fits />);

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

      await render(<Fits />);
      const user = userEvent.setup();
      await user.press(screen.getByText('Favorites'));

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.queryByText('Office Day')).toBeNull();
    });

    it('narrows to worn Fits when the Worn chip is tapped', async () => {
      mockFits({
        data: [fit({ id: 'a', name: 'Weekend Look' }), fit({ id: 'b', name: 'Office Day' })],
      });
      mockWornFitIds({ data: new Set(['a']) });

      await render(<Fits />);
      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));

      expect(screen.getByText('Weekend Look')).toBeTruthy();
      expect(screen.queryByText('Office Day')).toBeNull();
    });

    it('shows "Nothing worn yet." when the Worn filter matches nothing (fit_wears empty, pre-Story-4.2)', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look' })] });
      mockWornFitIds();

      await render(<Fits />);
      const user = userEvent.setup();
      await user.press(screen.getByText('Worn'));

      expect(screen.getByText('Nothing worn yet.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    });

    it('shows filter-specific empty copy when a filter matches nothing, keeping the chips visible', async () => {
      mockFits({ data: [fit({ id: 'a', name: 'Weekend Look', is_favorite: false })] });

      await render(<Fits />);
      const user = userEvent.setup();
      await user.press(screen.getByText('Favorites'));

      expect(screen.getByText('No Favorites yet.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    });

    it('keeps the all-Fits empty state (not a filter message) when there are no Fits at all', async () => {
      mockFits({ data: [] });

      await render(<Fits />);

      expect(await screen.findByText('Build your first Fit.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    });
  });
});
