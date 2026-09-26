import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, StyleSheet } from 'react-native';

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/profile/useProfile', () => ({ useProfile: jest.fn() }));
jest.mock('@/lib/profile/avatarUrl', () => ({ useAvatarUrl: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/planner/plannedFits', () => ({
  usePlannedFits: jest.fn(),
  planFit: jest.fn(),
  unplanDay: jest.fn(),
}));
jest.mock('@/lib/fits/wornFitIds', () => ({ useFitWearCounts: jest.fn(), useTodayWornFitIds: jest.fn() }));
// The streak math stays real; only the read is mocked.
jest.mock('@/lib/fits/wearStreak', () => ({
  ...jest.requireActual('@/lib/fits/wearStreak'),
  useWearDates: jest.fn(),
}));
// Keeps the real `markFitWorn`/`wearStreak` modules from loading the native Supabase client.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// The shared invalidation stays real so the test sees every key it touches.
jest.mock('@/lib/fits/markFitWorn', () => ({
  ...jest.requireActual('@/lib/fits/markFitWorn'),
  markFitWornToday: jest.fn(),
  unmarkFitWornToday: jest.fn(),
}));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/analytics/posthog', () => ({ trackFitPlanned: jest.fn(), trackFitWorn: jest.fn() }));
// Pins "today" to Wed Sep 24 2025 (the mockup's week) without faking timers, as `planner.test.tsx` does.
let mockToday = '2025-09-24';
jest.mock('@/lib/fits/localDate', () => ({
  ...jest.requireActual('@/lib/fits/localDate'),
  todayLocalDate: () => mockToday,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import Home from '@/app/(tabs)/index';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useProfile } from '@/lib/profile/useProfile';
import { useAvatarUrl } from '@/lib/profile/avatarUrl';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { planFit, unplanDay, usePlannedFits } from '@/lib/planner/plannedFits';
import { useFitWearCounts, useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { useWearDates } from '@/lib/fits/wearStreak';
import { markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { trackFitPlanned, trackFitWorn } from '@/lib/analytics/posthog';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

const MON = '2025-09-22';
const TUE = '2025-09-23';
const WED = '2025-09-24';
const THU = '2025-09-25';
const SUN = '2025-09-28';

function fit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-a',
    name: 'Sunday Market',
    cover_path: 'user-1/fits/fit-a/cover.png',
    canvas_background_color: '#DCE8DC',
    updated_at: '2025-09-20T12:00:00.000Z',
    is_favorite: false,
    ...overrides,
  };
}

const FIT_A = fit();
const FIT_B = fit({ id: 'fit-b', name: 'Office Day', cover_path: 'user-1/fits/fit-b/cover.png', canvas_background_color: null });

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn(), ...overrides };
}

function mockFits(overrides: Record<string, unknown> = {}) {
  (useFits as jest.Mock).mockReturnValue(query({ data: [FIT_A, FIT_B], ...overrides }));
}

function mockPlans(plans: { planned_on: string; fit_id: string }[], overrides: Record<string, unknown> = {}) {
  (usePlannedFits as jest.Mock).mockReturnValue(query({ data: plans, ...overrides }));
}

function mockWearCounts(counts: [string, number][], overrides: Record<string, unknown> = {}) {
  (useFitWearCounts as jest.Mock).mockReturnValue(query({ data: new Map(counts), ...overrides }));
}

function mockTodayWorn(ids: string[], overrides: Record<string, unknown> = {}) {
  (useTodayWornFitIds as jest.Mock).mockReturnValue(query({ data: new Set(ids), ...overrides }));
}

function mockWearDates(dates: string[], overrides: Record<string, unknown> = {}) {
  (useWearDates as jest.Mock).mockReturnValue(query({ data: new Set(dates), ...overrides }));
}

let queryClient: QueryClient;

/**
 * Holds a wear write open. Once it lands, Home drops its optimistic state
 * and reads the (static, mocked) server data again, so assertions on the
 * optimistic state have to run before it resolves.
 */
function pendingWrite(mock: unknown) {
  let resolve: () => void = () => {};
  (mock as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
  return () => act(async () => resolve());
}

async function renderHome() {
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup() };
}

function button(name: string) {
  return screen.getByRole('button', { name });
}

function focus() {
  const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
  return act(async () => onFocus());
}

describe('Home tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToday = WED;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useProfile as jest.Mock).mockReturnValue({ data: { avatar_path: null } });
    (useAvatarUrl as jest.Mock).mockReturnValue({ data: null });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: { [FIT_A.cover_path as string]: 'https://signed/fit-a.png' } });
    (markFitWornToday as jest.Mock).mockResolvedValue(undefined);
    (unmarkFitWornToday as jest.Mock).mockResolvedValue(undefined);
    (planFit as jest.Mock).mockResolvedValue(undefined);
    (unplanDay as jest.Mock).mockResolvedValue(undefined);
    mockFits();
    mockPlans([]);
    mockWearCounts([]);
    mockTodayWorn([]);
    mockWearDates([]);
  });

  describe('header', () => {
    it("shows today's long date over the Today title, with the profile button", async () => {
      const { user } = await renderHome();

      expect(screen.getByText('Wednesday, Sep 24')).toBeTruthy();
      expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
      await user.press(button('Profile'));
      expect(router.push).toHaveBeenCalledWith('/profile');
    });

    it('reads the current week of plans', async () => {
      await renderHome();

      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', MON);
    });

    it('moves to the new day and refetches the wear reads when the app returns to the foreground', async () => {
      const listener = AppState.addEventListener as jest.Mock;
      const refetchToday = jest.fn();
      const refetchDates = jest.fn();
      mockTodayWorn([], { refetch: refetchToday });
      mockWearDates([], { refetch: refetchDates });
      await renderHome();

      mockToday = '2025-09-29';
      const onChange = listener.mock.calls.at(-1)?.[1] as (state: string) => void;
      await act(async () => onChange('active'));

      expect(screen.getByText('Monday, Sep 29')).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', '2025-09-29');
      expect(refetchToday).toHaveBeenCalled();
      expect(refetchDates).toHaveBeenCalled();
    });

    it('ignores the app going to the background', async () => {
      const listener = AppState.addEventListener as jest.Mock;
      await renderHome();

      mockToday = '2025-09-29';
      const onChange = listener.mock.calls.at(-1)?.[1] as (state: string) => void;
      await act(async () => onChange('background'));

      expect(screen.getByText('Wednesday, Sep 24')).toBeTruthy();
    });

    it('moves to the new day when the tab regains focus', async () => {
      await renderHome();

      mockToday = '2025-09-29';
      await focus();

      expect(screen.getByText('Monday, Sep 29')).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', '2025-09-29');
    });
  });

  describe("today's Fit", () => {
    it('shows the planned Fit with its wear count and Mark worn', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 3]]);

      await renderHome();

      expect(screen.getByText('Sunday Market')).toBeTruthy();
      expect(screen.getByText('Planned for today · Worn 3×')).toBeTruthy();
      expect(button('Mark worn')).toBeTruthy();
      expect(button("Change today's Fit")).toBeTruthy();
    });

    it('leaves the count out for a Fit never worn', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);

      await renderHome();

      expect(screen.getByText('Planned for today')).toBeTruthy();
    });

    it("fills the tile with the Fit's canvas color and opens Fit detail on tap", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);

      const { user } = await renderHome();

      const tile = button('Open Sunday Market');
      expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ backgroundColor: '#DCE8DC' });
      await user.press(tile);
      expect(router.push).toHaveBeenCalledWith('/fit/fit-a');
    });

    it('uses the raised surface for a Fit with no canvas color', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-b' }]);

      await renderHome();

      expect(button('Open Office Day').props.className).toContain('bg-surface-raised');
    });

    it('shows the worn state when the Fit was already worn today', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 5]]);
      mockTodayWorn(['fit-a']);

      await renderHome();

      expect(screen.getByText('Worn 5× · including today')).toBeTruthy();
      expect(button('Worn today. Tap to undo')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Mark worn' })).toBeNull();
    });

    it('marks worn at once, writes, tracks source home and invalidates every wear read', async () => {
      let resolve: () => void = () => {};
      (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 3]]);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderHome();

      await user.press(button('Mark worn'));

      expect(button('Worn today. Tap to undo')).toBeTruthy();
      expect(screen.getByText('Worn 4× · including today')).toBeTruthy();
      expect(markFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');

      await act(async () => resolve());
      await waitFor(() => expect(trackFitWorn).toHaveBeenCalledWith('home'));
      for (const key of ['wornFitIds', 'todayWornFitIds', 'fitWearsRange', 'wearDates']) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, 'user-1'] });
      }
    });

    it('undoes a wear from Worn today', async () => {
      const settle = pendingWrite(unmarkFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 4]]);
      mockTodayWorn(['fit-a']);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      expect(button('Mark worn')).toBeTruthy();
      expect(screen.getByText('Planned for today · Worn 3×')).toBeTruthy();
      expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');

      await settle();
      expect(trackFitWorn).not.toHaveBeenCalled();
    });

    it('reverts and shows the no-connection notice when Mark worn fails offline', async () => {
      (markFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button('Mark worn'));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(button('Mark worn')).toBeTruthy();
      expect(trackFitWorn).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('reverts and reports an unknown failure', async () => {
      (unmarkFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-a']);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(button('Worn today. Tap to undo')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('ignores a second tap while the write is in flight', async () => {
      let resolve: () => void = () => {};
      (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button('Mark worn'));
      await user.press(button('Worn today. Tap to undo'));

      expect(markFitWornToday).toHaveBeenCalledTimes(1);
      expect(unmarkFitWornToday).not.toHaveBeenCalled();

      await act(async () => resolve());
    });

    it("opens today's day sheet from Change and replaces the Fit", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));

      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      expect(screen.getAllByText('Wednesday, Sep 24').length).toBeGreaterThan(1);
      expect(button('Sunday Market').props.accessibilityState).toMatchObject({ selected: true });
      await user.press(button('Office Day'));

      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
      expect(planFit).toHaveBeenCalledWith('user-1', WED, 'fit-b');
      expect(trackFitPlanned).toHaveBeenCalledWith(0);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plannedFits', 'user-1'] });
    });
  });

  describe('removing today', () => {
    it("removes today's Fit from the day sheet", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      await user.press(button('Remove from Wednesday'));

      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
      expect(unplanDay).toHaveBeenCalledWith(WED);
      expect(trackFitPlanned).not.toHaveBeenCalled();
    });
  });

  describe('nothing planned', () => {
    it('shows the empty card and plans today from the day sheet', async () => {
      const { user } = await renderHome();

      expect(screen.getByText('Nothing planned for today.')).toBeTruthy();
      expect(screen.getByText("Pick one of your Fits and it'll be waiting here each morning.")).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Mark worn' })).toBeNull();

      await user.press(button("Plan today's Fit"));
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      await user.press(button('Sunday Market'));

      await waitFor(() => expect(planFit).toHaveBeenCalledWith('user-1', WED, 'fit-a'));
      expect(trackFitPlanned).toHaveBeenCalledWith(0);
    });

    it('keeps the sheet open with the no-connection notice when planning fails offline', async () => {
      (planFit as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      const { user } = await renderHome();

      await user.press(button("Plan today's Fit"));
      await user.press(button('Sunday Market'));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
    });

    it("treats a plan whose Fit was deleted as nothing planned", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-deleted' }]);

      await renderHome();

      expect(screen.getByText('Nothing planned for today.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Mark worn' })).toBeNull();
    });

    it('ignores plans for other days', async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);

      await renderHome();

      expect(screen.getByText('Nothing planned for today.')).toBeTruthy();
    });

    it('invites building a Fit when there are none', async () => {
      mockFits({ data: [] });

      const { user } = await renderHome();

      expect(screen.getByText('Nothing planned for today.')).toBeTruthy();
      expect(screen.getByText('Save a Fit first, then plan it here.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: "Plan today's Fit" })).toBeNull();
      await user.press(button('Build a Fit'));
      expect(router.push).toHaveBeenCalledWith('/new-fit');
    });
  });

  describe('wear streak', () => {
    it('counts through yesterday when today is not worn yet', async () => {
      mockWearDates([MON, TUE]);

      await renderHome();

      expect(screen.getByText('Wear streak')).toBeTruthy();
      expect(screen.getByText('2 days')).toBeTruthy();
      expect(screen.getByText('In a row, through yesterday')).toBeTruthy();
    });

    it('counts today once worn', async () => {
      mockWearDates([TUE, WED]);

      await renderHome();

      expect(screen.getByText('2 days')).toBeTruthy();
      expect(screen.getByText('In a row, including today')).toBeTruthy();
    });

    it('says "1 day" for a single day', async () => {
      mockWearDates([WED]);

      await renderHome();

      expect(screen.getByText('1 day')).toBeTruthy();
    });

    it('hides the row when the streak is broken', async () => {
      mockWearDates([MON]);

      await renderHome();

      expect(screen.queryByText('Wear streak')).toBeNull();
    });

    it('grows by one when today is marked worn', async () => {
      const settle = pendingWrite(markFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearDates([MON, TUE]);
      const { user } = await renderHome();

      await user.press(button('Mark worn'));

      expect(screen.getByText('3 days')).toBeTruthy();
      expect(screen.getByText('In a row, including today')).toBeTruthy();
      await settle();
    });

    it("shrinks by one when today's only wear is undone", async () => {
      const settle = pendingWrite(unmarkFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-a']);
      mockWearDates([TUE, WED]);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      expect(screen.getByText('1 day')).toBeTruthy();
      expect(screen.getByText('In a row, through yesterday')).toBeTruthy();
      await settle();
    });

    it('keeps today in the streak when another Fit was also worn today', async () => {
      const settle = pendingWrite(unmarkFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-a', 'fit-b']);
      mockWearDates([TUE, WED]);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      expect(screen.getByText('2 days')).toBeTruthy();
      expect(screen.getByText('In a row, including today')).toBeTruthy();
      await settle();
    });

    it('hides the row and reports when the streak read fails', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearDates([], { data: undefined, isError: true, error: new Error('boom') });

      await renderHome();

      expect(screen.queryByText('Wear streak')).toBeNull();
      expect(button('Mark worn')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('does not report a streak read that failed offline', async () => {
      mockWearDates([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });

      await renderHome();

      expect(screen.queryByText('Wear streak')).toBeNull();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('leaves the count out and reports when the wear-count read fails', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([], { data: undefined, isError: true, error: new Error('boom') });

      await renderHome();

      expect(screen.getByText('Planned for today')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('this week', () => {
    it('shows seven days with planned tiles filled and empty days dashed', async () => {
      mockPlans([
        { planned_on: MON, fit_id: 'fit-b' },
        { planned_on: WED, fit_id: 'fit-a' },
      ]);

      await renderHome();

      expect(screen.getByText('This week')).toBeTruthy();
      const strip = screen.getByTestId('home-week');
      for (const label of ['M', 'W', 'F']) {
        expect(within(strip).getByText(label)).toBeTruthy();
      }
      expect(within(strip).getAllByText('T')).toHaveLength(2);
      expect(within(strip).getAllByText('S')).toHaveLength(2);
      expect(screen.getByTestId(`home-week-tile-${MON}`).props.className).toContain('bg-surface-raised');
      expect(StyleSheet.flatten(screen.getByTestId(`home-week-tile-${WED}`).props.style)).toMatchObject({
        backgroundColor: '#DCE8DC',
      });
      expect(screen.getByTestId(`home-week-tile-${SUN}`).props.className).toContain('border-dashed');
    });

    it('marks today with an ink border and label', async () => {
      await renderHome();

      expect(screen.getByTestId(`home-week-tile-${WED}`).props.className).toMatch(/(^| )border-ink-primary( |$)/);
      expect(screen.getByTestId(`home-week-tile-${THU}`).props.className).not.toMatch(/(^| )border-ink-primary( |$)/);
      expect(screen.getByTestId(`home-week-label-${WED}`).props.className).toMatch(/(^| )text-ink-primary( |$)/);
      expect(screen.getByTestId(`home-week-label-${THU}`).props.className).toMatch(/(^| )text-ink-secondary( |$)/);
    });

    it('treats a plan for a deleted Fit as an empty day', async () => {
      mockPlans([{ planned_on: TUE, fit_id: 'fit-deleted' }]);

      await renderHome();

      expect(screen.getByTestId(`home-week-tile-${TUE}`).props.className).toContain('border-dashed');
    });

    it('has no tappable tiles, and a Planner link to the tab', async () => {
      const { user } = await renderHome();

      expect(within(screen.getByTestId('home-week')).queryAllByRole('button')).toHaveLength(0);
      await user.press(screen.getByRole('link', { name: 'Planner' }));
      expect(router.navigate).toHaveBeenCalledWith('/planner');
    });
  });

  describe('states', () => {
    it('shows the skeleton while the plans load', async () => {
      mockPlans([], { data: undefined, isLoading: true });

      await renderHome();

      expect(screen.getByTestId('home-skeleton', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByText('Nothing planned for today.')).toBeNull();
    });

    it('shows the skeleton while the Fits load', async () => {
      mockFits({ data: undefined, isLoading: true });

      await renderHome();

      expect(screen.getByTestId('home-skeleton', { includeHiddenElements: true })).toBeTruthy();
    });

    it('shows the no-connection notice with Retry when the plans fail to load', async () => {
      const refetchPlans = jest.fn();
      const refetchFits = jest.fn();
      mockFits({ refetch: refetchFits });
      mockPlans([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE), refetch: refetchPlans });

      const { user } = await renderHome();

      expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.queryByText('Nothing planned for today.')).toBeNull();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      await user.press(button('Retry'));
      expect(refetchPlans).toHaveBeenCalled();
      expect(refetchFits).toHaveBeenCalled();
    });

    it('shows the unknown-error notice and reports when the Fits fail to load', async () => {
      mockFits({ data: undefined, isError: true, error: new Error('boom') });

      await renderHome();

      expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('keeps showing Home when a refetch fails but earlier data is cached', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }], { isError: true, error: new Error('boom') });

      await renderHome();

      expect(button('Mark worn')).toBeTruthy();
      expect(screen.queryByText(UNKNOWN_ERROR_MESSAGE)).toBeNull();
    });

    it('refetches every read when the tab regains focus', async () => {
      const refetches = { fits: jest.fn(), plans: jest.fn(), counts: jest.fn(), today: jest.fn(), dates: jest.fn() };
      mockFits({ refetch: refetches.fits });
      mockPlans([], { refetch: refetches.plans });
      mockWearCounts([], { refetch: refetches.counts });
      mockTodayWorn([], { refetch: refetches.today });
      mockWearDates([], { refetch: refetches.dates });

      await renderHome();
      await focus();

      for (const refetch of Object.values(refetches)) {
        expect(refetch).toHaveBeenCalled();
      }
    });
  });
});
