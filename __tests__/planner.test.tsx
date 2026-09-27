import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionSheetIOS, StyleSheet } from 'react-native';

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/planner/plannedFits', () => ({
  usePlannedFits: jest.fn(),
  useWeekWears: jest.fn(),
  usePlannedMonth: jest.fn(),
  useMonthWears: jest.fn(),
  planFit: jest.fn(),
  unplanDay: jest.fn(),
}));
jest.mock('@/lib/planner/viewPreference', () => ({ loadPlannerView: jest.fn(), savePlannerView: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/fits/wearPhoto', () => ({
  chooseWearPhotoSource: jest.fn(),
  pickWearPhoto: jest.fn(),
  saveWearPhoto: jest.fn(),
  removeWearPhoto: jest.fn(),
  deleteWearPhotoFiles: jest.fn(),
  useWearPhotoUrls: jest.fn(),
}));
// Keeps the real `markFitWorn` (whose invalidation the photo writes reuse) from loading the native Supabase client.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// Story 5.6: the day sheet's Mark worn. The shared invalidation stays real so the test sees every key it touches.
jest.mock('@/lib/fits/markFitWorn', () => ({
  ...jest.requireActual('@/lib/fits/markFitWorn'),
  markFitWornToday: jest.fn(),
  unmarkFitWornToday: jest.fn(),
}));
jest.mock('@/lib/fits/wornFitIds', () => ({ useFitWearCounts: jest.fn(), useTodayWornFitIds: jest.fn() }));
jest.mock('@/lib/analytics/posthog', () => ({ trackFitPlanned: jest.fn(), trackFitWorn: jest.fn() }));
// Pins "today" to Wed Sep 24 2025 (the mockup's week) without faking timers; `toLocalDate` stays
// real so the week helpers still do their own date math.
let mockToday = '2025-09-24';
jest.mock('@/lib/fits/localDate', () => ({
  ...jest.requireActual('@/lib/fits/localDate'),
  todayLocalDate: () => mockToday,
}));
// Story 5.5: the `date` param Fit detail's "Worn" strip opens a day with.
let mockParams: { date?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import Planner from '@/app/(tabs)/planner';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { planFit, unplanDay, useMonthWears, usePlannedFits, usePlannedMonth, useWeekWears } from '@/lib/planner/plannedFits';
import { loadPlannerView, savePlannerView } from '@/lib/planner/viewPreference';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import {
  chooseWearPhotoSource,
  pickWearPhoto,
  removeWearPhoto,
  saveWearPhoto,
  useWearPhotoUrls,
  type WearPhoto,
} from '@/lib/fits/wearPhoto';
import { trackFitPlanned, trackFitWorn } from '@/lib/analytics/posthog';
import { markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useFitWearCounts, useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

const MON = '2025-09-22';
const TUE = '2025-09-23';
const WED = '2025-09-24';
const THU = '2025-09-25';

function fit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-a',
    name: 'Sunday Market',
    cover_path: 'user-1/fits/fit-a/cover.png',
    canvas_background_color: null,
    updated_at: '2025-09-20T12:00:00.000Z',
    is_favorite: false,
    ...overrides,
  };
}

const FIT_A = fit();
const FIT_B = fit({ id: 'fit-b', name: 'Office Day', cover_path: 'user-1/fits/fit-b/cover.png', canvas_background_color: '#DCE8DC' });

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn(), ...overrides };
}

function mockFits(overrides: Record<string, unknown> = {}) {
  (useFits as jest.Mock).mockReturnValue(query({ data: [FIT_A, FIT_B], ...overrides }));
}

function mockPlans(plans: { planned_on: string; fit_id: string }[], overrides: Record<string, unknown> = {}) {
  (usePlannedFits as jest.Mock).mockReturnValue(query({ data: plans, ...overrides }));
}

/** Wears as `fit|date` keys, each with id `wear-{key}` and the given photo, if any. */
function wears(keys: string[], photos: Record<string, WearPhoto> = {}) {
  return { keys: new Set(keys), byKey: new Map(keys.map((key) => [key, { id: `wear-${key}`, photo: photos[key] ?? null }])) };
}

function mockWears(keys: string[], overrides: Record<string, unknown> = {}, photos: Record<string, WearPhoto> = {}) {
  (useWeekWears as jest.Mock).mockReturnValue(query({ data: wears(keys, photos), ...overrides }));
}

function mockWearCounts(counts: [string, number][], overrides: Record<string, unknown> = {}) {
  (useFitWearCounts as jest.Mock).mockReturnValue(query({ data: new Map(counts), ...overrides }));
}

/** Today's wears by Fit id, with the same ids as `wears()` gives them for today's date. */
function mockTodayWorn(ids: string[], overrides: Record<string, unknown> = {}, photos: Record<string, WearPhoto> = {}) {
  const today = new Map(ids.map((id) => [id, { id: `wear-${id}|${mockToday}`, photo: photos[id] ?? null }]));
  (useTodayWornFitIds as jest.Mock).mockReturnValue(query({ data: today, ...overrides }));
}

function mockMonthPlans(plans: { planned_on: string; fit_id: string }[], overrides: Record<string, unknown> = {}) {
  (usePlannedMonth as jest.Mock).mockReturnValue(query({ data: plans, ...overrides }));
}

function mockMonthWears(keys: string[], overrides: Record<string, unknown> = {}, photos: Record<string, WearPhoto> = {}) {
  (useMonthWears as jest.Mock).mockReturnValue(query({ data: wears(keys, photos), ...overrides }));
}

let queryClient: QueryClient;
/** expo-image's native view receives `source`/`placeholder` as arrays; the first entry is what the component passed. */
function imageProp(element: { props: Record<string, unknown> }, name: 'source' | 'placeholder') {
  const value = element.props[name];
  return (Array.isArray(value) ? value[0] : value) as Record<string, string> | undefined;
}

/** How expo-image hands a `{ thumbhash }` placeholder to its native view. */
function thumbhashUri(hash: string) {
  return `thumbhash:/${encodeURIComponent(hash)}`;
}


async function renderPlanner() {
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <Planner />
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup() };
}

function row(name: string) {
  return screen.getByRole('button', { name });
}

describe('Planner tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToday = '2025-09-24';
    mockParams = {};
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
    (planFit as jest.Mock).mockResolvedValue(undefined);
    (unplanDay as jest.Mock).mockResolvedValue(undefined);
    (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: {} });
    (chooseWearPhotoSource as jest.Mock).mockResolvedValue('library');
    (pickWearPhoto as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    (saveWearPhoto as jest.Mock).mockResolvedValue(undefined);
    (removeWearPhoto as jest.Mock).mockResolvedValue(undefined);
    mockFits();
    mockPlans([]);
    mockWears([]);
    mockMonthPlans([]);
    mockMonthWears([]);
    (loadPlannerView as jest.Mock).mockResolvedValue('week');
    (savePlannerView as jest.Mock).mockResolvedValue(undefined);
    (markFitWornToday as jest.Mock).mockResolvedValue(undefined);
    (unmarkFitWornToday as jest.Mock).mockResolvedValue(undefined);
    mockWearCounts([]);
    mockTodayWorn([]);
  });

  describe('header and week', () => {
    it("opens on the current Monday-start week with the range over the title", async () => {
      await renderPlanner();

      expect(screen.getByText('Sep 22 – 28')).toBeTruthy();
      expect(screen.getByRole('header', { name: 'Planner' })).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', MON);
      expect(useWeekWears).toHaveBeenLastCalledWith('user-1', MON);
    });

    it('moves to the next week and back', async () => {
      const { user } = await renderPlanner();

      await user.press(screen.getByRole('button', { name: 'Next week' }));
      expect(screen.getByText('Sep 29 – Oct 5')).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', '2025-09-29');
      expect(row('Monday, Sep 29: nothing planned')).toBeTruthy();

      await user.press(screen.getByRole('button', { name: 'Previous week' }));
      await user.press(screen.getByRole('button', { name: 'Previous week' }));
      expect(screen.getByText('Sep 15 – 21')).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', '2025-09-15');
    });

    it('follows today into the next week when the tab regains focus on a new Monday', async () => {
      await renderPlanner();

      mockToday = '2025-09-29';
      const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
      await act(async () => onFocus());

      expect(screen.getByText('Sep 29 – Oct 5')).toBeTruthy();
      expect(within(row('Monday, Sep 29: nothing planned')).getByText('Today')).toBeTruthy();
    });

    it('keeps a week the user paged to when the day rolls over', async () => {
      const { user } = await renderPlanner();
      await user.press(screen.getByRole('button', { name: 'Previous week' }));

      mockToday = '2025-09-29';
      const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
      await act(async () => onFocus());

      expect(screen.getByText('Sep 15 – 21')).toBeTruthy();
    });

    it('lists seven day rows, Monday to Sunday, each labelled with its day and plan', async () => {
      mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);

      await renderPlanner();

      expect(row('Monday, Sep 22: Sunday Market')).toBeTruthy();
      for (const label of [
        'Tuesday, Sep 23',
        'Wednesday, Sep 24',
        'Thursday, Sep 25',
        'Friday, Sep 26',
        'Saturday, Sep 27',
        'Sunday, Sep 28',
      ]) {
        expect(row(`${label}: nothing planned`)).toBeTruthy();
      }
    });

    it('marks today with "Today" and a dot, and mutes past dates', async () => {
      await renderPlanner();

      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.queryByText('Wed')).toBeNull();
      expect(screen.getAllByTestId('planner-today-dot')).toHaveLength(1);
      expect(within(row('Wednesday, Sep 24: nothing planned')).getByTestId('planner-today-dot')).toBeTruthy();
      expect(screen.getByText('22').props.className).toMatch(/(^| )text-ink-secondary( |$)/);
      expect(screen.getByText('24').props.className).toMatch(/(^| )text-ink-primary( |$)/);
      expect(screen.getByText('25').props.className).toMatch(/(^| )text-ink-primary( |$)/);
    });
  });

  describe('day rows', () => {
    it('shows "Planned", "Planned for today" and "Worn" captions', async () => {
      mockPlans([
        { planned_on: MON, fit_id: 'fit-a' },
        { planned_on: WED, fit_id: 'fit-b' },
        { planned_on: THU, fit_id: 'fit-a' },
      ]);
      mockWears([`fit-a|${MON}`]);

      await renderPlanner();

      expect(within(row('Monday, Sep 22: Sunday Market')).getByText('Worn')).toBeTruthy();
      expect(within(row('Wednesday, Sep 24: Office Day')).getByText('Planned for today')).toBeTruthy();
      expect(within(row('Thursday, Sep 25: Sunday Market')).getByText('Planned')).toBeTruthy();
    });

    it('shows "Worn" rather than "Planned for today" once the Fit is worn today', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-b' }]);
      mockWears([`fit-b|${WED}`]);

      await renderPlanner();

      expect(within(row('Wednesday, Sep 24: Office Day')).getByText('Worn')).toBeTruthy();
      expect(screen.queryByText('Planned for today')).toBeNull();
    });

    it('only counts a wear of that Fit on that day', async () => {
      mockPlans([{ planned_on: TUE, fit_id: 'fit-a' }]);
      mockWears([`fit-a|${MON}`, `fit-b|${TUE}`]);

      await renderPlanner();

      expect(within(row('Tuesday, Sep 23: Sunday Market')).getByText('Planned')).toBeTruthy();
      expect(screen.queryByText('Worn')).toBeNull();
    });

    it("fills a planned tile with the Fit's canvas color, or the raised surface when it has none", async () => {
      mockPlans([
        { planned_on: MON, fit_id: 'fit-a' },
        { planned_on: THU, fit_id: 'fit-b' },
      ]);

      await renderPlanner();

      expect(StyleSheet.flatten(screen.getByTestId(`planner-tile-${THU}`).props.style)).toMatchObject({
        backgroundColor: '#DCE8DC',
      });
      expect(screen.getByTestId(`planner-tile-${MON}`).props.className).toContain('bg-surface-raised');
    });

    it('shows an empty day as "Nothing planned"', async () => {
      await renderPlanner();

      expect(within(row('Thursday, Sep 25: nothing planned')).getByText('Nothing planned')).toBeTruthy();
    });

    it('treats a plan whose Fit was deleted as an empty day', async () => {
      mockPlans([{ planned_on: TUE, fit_id: 'fit-deleted' }]);

      await renderPlanner();

      expect(within(row('Tuesday, Sep 23: nothing planned')).getByText('Nothing planned')).toBeTruthy();
    });
  });

  describe('states', () => {
    it('shows skeleton rows while the Fits load', async () => {
      mockFits({ data: undefined, isLoading: true });

      await renderPlanner();

      expect(screen.getByTestId('planner-skeleton', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByText('Nothing planned')).toBeNull();
    });

    it('shows skeleton rows while the plans load', async () => {
      mockPlans([], { data: undefined, isLoading: true });

      await renderPlanner();

      expect(screen.getByTestId('planner-skeleton', { includeHiddenElements: true })).toBeTruthy();
    });

    it('shows the no-connection notice with Retry when the plans fail to load', async () => {
      const refetchPlans = jest.fn();
      const refetchFits = jest.fn();
      mockFits({ refetch: refetchFits });
      mockPlans([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE), refetch: refetchPlans });

      const { user } = await renderPlanner();

      expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.queryByText('Nothing planned')).toBeNull();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      await user.press(screen.getByRole('button', { name: 'Retry' }));
      expect(refetchPlans).toHaveBeenCalled();
      expect(refetchFits).toHaveBeenCalled();
    });

    it('keeps showing the week when a refetch fails but earlier data is still cached', async () => {
      mockPlans([{ planned_on: MON, fit_id: 'fit-a' }], { isError: true, error: new Error('boom') });

      await renderPlanner();

      expect(row('Monday, Sep 22: Sunday Market')).toBeTruthy();
      expect(screen.queryByText(UNKNOWN_ERROR_MESSAGE)).toBeNull();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('shows the unknown-error notice and reports when the Fits fail to load', async () => {
      mockFits({ data: undefined, isError: true, error: new Error('boom') });

      await renderPlanner();

      expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('fails open when the wears read fails: no "Worn", plans still show, error reported', async () => {
      mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
      mockWears([], { data: undefined, isError: true, error: new Error('boom') });

      await renderPlanner();

      expect(within(row('Monday, Sep 22: Sunday Market')).getByText('Planned')).toBeTruthy();
      expect(screen.queryByText('Worn')).toBeNull();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('does not report a wears read that failed for lack of connection', async () => {
      mockWears([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });

      await renderPlanner();

      expect(row('Monday, Sep 22: nothing planned')).toBeTruthy();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('invites building a Fit when there are none, with no week list', async () => {
      mockFits({ data: [] });

      const { user } = await renderPlanner();

      expect(screen.getByText('Nothing to plan yet.')).toBeTruthy();
      expect(screen.getByText("Save a Fit first, then give it a day. It'll be waiting on Home that morning.")).toBeTruthy();
      expect(screen.queryByText('Nothing planned')).toBeNull();
      await user.press(screen.getByRole('button', { name: 'Build a Fit' }));
      expect(router.push).toHaveBeenCalledWith('/new-fit');
    });

    it("refetches the Fits, plans, wears, wear counts and today's wears when the tab regains focus", async () => {
      const refetchFits = jest.fn();
      const refetchPlans = jest.fn();
      const refetchWears = jest.fn();
      const refetchCounts = jest.fn();
      const refetchTodayWorn = jest.fn();
      mockFits({ refetch: refetchFits });
      mockPlans([], { refetch: refetchPlans });
      mockWears([], { refetch: refetchWears });
      mockWearCounts([], { refetch: refetchCounts });
      mockTodayWorn([], { refetch: refetchTodayWorn });

      await renderPlanner();
      const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
      onFocus();

      expect(refetchFits).toHaveBeenCalled();
      expect(refetchPlans).toHaveBeenCalled();
      expect(refetchWears).toHaveBeenCalled();
      expect(refetchCounts).toHaveBeenCalled();
      expect(refetchTodayWorn).toHaveBeenCalled();
    });

    it('fails open and reports when the wear counts read fails', async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      mockWearCounts([], { data: undefined, isError: true, error: new Error('boom') });

      await renderPlanner();

      expect(row('Thursday, Sep 25: Sunday Market')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it("fails open and reports when today's wears read fails", async () => {
      mockTodayWorn([], { data: undefined, isError: true, error: new Error('boom') });

      await renderPlanner();

      expect(row('Wednesday, Sep 24: nothing planned')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it("does not report a wear counts or today's wears read that failed offline", async () => {
      const offline = new FitError('no_connection', NO_CONNECTION_MESSAGE);
      mockWearCounts([], { data: undefined, isError: true, error: offline });
      mockTodayWorn([], { data: undefined, isError: true, error: offline });

      await renderPlanner();

      expect(row('Wednesday, Sep 24: nothing planned')).toBeTruthy();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('day sheet', () => {
    it('opens for the tapped day with every Fit to choose from', async () => {
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: nothing planned'));

      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      expect(screen.getByText('Thursday, Sep 25')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sunday Market' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Office Day' })).toBeTruthy();
      expect(screen.queryByText('Remove from Thursday')).toBeNull();
    });

    it('closes from its close button without writing', async () => {
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: nothing planned'));
      await user.press(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByText('Choose a Fit')).toBeNull();
      expect(planFit).not.toHaveBeenCalled();
    });

    it('assigns a Fit to an empty day, tracks it and closes', async () => {
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: nothing planned'));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));

      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
      expect(planFit).toHaveBeenCalledWith('user-1', THU, 'fit-a');
      expect(trackFitPlanned).toHaveBeenCalledWith(1);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plannedFits', 'user-1'] });
    });

    it('replaces the current pick, which is marked in the grid', async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      expect(screen.getByRole('button', { name: 'Sunday Market' }).props.accessibilityState).toMatchObject({ selected: true });
      expect(screen.getByRole('button', { name: 'Office Day' }).props.accessibilityState).toMatchObject({ selected: false });
      expect(screen.getByTestId('plan-sheet-check-fit-a')).toBeTruthy();
      await user.press(screen.getByRole('button', { name: 'Office Day' }));

      await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
      expect(planFit).toHaveBeenCalledWith('user-1', THU, 'fit-b');
      expect(trackFitPlanned).toHaveBeenCalledWith(1);
    });

    it("just closes when the day's current Fit is tapped again, without writing or tracking", async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));

      expect(screen.queryByText('Change Fit')).toBeNull();
      expect(planFit).not.toHaveBeenCalled();
      expect(trackFitPlanned).not.toHaveBeenCalled();
    });

    it('offers no Remove for a day whose planned Fit was deleted', async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-deleted' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: nothing planned'));

      expect(screen.queryByText('Remove from Thursday')).toBeNull();
      expect(screen.getByRole('button', { name: 'Sunday Market' }).props.accessibilityState).toMatchObject({ selected: false });
    });

    it('lets a past day be planned, tracking a negative days_ahead', async () => {
      const { user } = await renderPlanner();

      await user.press(row('Monday, Sep 22: nothing planned'));
      await user.press(screen.getByRole('button', { name: 'Office Day' }));

      await waitFor(() => expect(planFit).toHaveBeenCalledWith('user-1', MON, 'fit-b'));
      expect(trackFitPlanned).toHaveBeenCalledWith(-2);
    });

    it('removes the day\'s Fit without tracking a plan', async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      await user.press(screen.getByRole('button', { name: 'Remove from Thursday' }));

      await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
      expect(unplanDay).toHaveBeenCalledWith(THU);
      expect(planFit).not.toHaveBeenCalled();
      expect(trackFitPlanned).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plannedFits', 'user-1'] });
    });

    it('stays open with the no-connection notice when a write fails offline', async () => {
      (planFit as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: nothing planned'));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      expect(trackFitPlanned).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('stays open with the unknown-error notice and reports an unexpected write failure', async () => {
      (unplanDay as jest.Mock).mockRejectedValue(new Error('boom'));
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      await user.press(screen.getByRole('button', { name: 'Remove from Thursday' }));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(screen.getByText('Change Fit')).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('ignores other taps while a write is in flight', async () => {
      let resolve: () => void = () => {};
      (planFit as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      await user.press(screen.getByRole('button', { name: 'Office Day' }));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));
      await user.press(screen.getByRole('button', { name: 'Remove from Thursday' }));
      await user.press(screen.getByRole('button', { name: 'Close' }));
      await user.press(screen.getByRole('button', { name: 'Dismiss', includeHiddenElements: true }));

      expect(planFit).toHaveBeenCalledTimes(1);
      expect(unplanDay).not.toHaveBeenCalled();
      expect(screen.getByText('Change Fit')).toBeTruthy();

      await act(async () => resolve());
      await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
    });
  });

  describe('wear photos', () => {
    const MON_KEY = `fit-a|${MON}`;
    const MON_WEAR = `wear-${MON_KEY}`;
    const PHOTO: WearPhoto = {
      path: `user-1/${MON_WEAR}/p.webp`,
      thumbPath: `user-1/${MON_WEAR}/p_thumb.webp`,
      thumbhash: 'hash-mon',
    };

    function wornMonday(photo?: WearPhoto) {
      mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
      mockWears([MON_KEY], {}, photo ? { [MON_KEY]: photo } : {});
    }

    async function openMonday() {
      const rendered = await renderPlanner();
      await rendered.user.press(row('Monday, Sep 22: Sunday Market'));
      return rendered;
    }

    function mockConfirm(buttonIndex: number) {
      return jest
        .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
        .mockImplementation((_options, callback) => callback(buttonIndex));
    }

    afterEach(() => {
      (ActionSheetIOS.showActionSheetWithOptions as unknown as Partial<jest.SpyInstance>).mockRestore?.();
    });

    describe('day sheet', () => {
      it('captions a worn day with its Fit and offers a dashed photo slot beside the collage', async () => {
        wornMonday();

        await openMonday();

        expect(within(screen.getByTestId('day-fit-header')).getByText('Worn')).toBeTruthy();
        expect(screen.getByText('Monday, Sep 22')).toBeTruthy();
        const slot = screen.getByRole('button', { name: 'Add a photo of what you wore' });
        expect(within(slot).getByText('Add a photo')).toBeTruthy();
        expect(within(slot).getByText('How it actually looked on you')).toBeTruthy();
        expect(slot.props.className).toContain('border-dashed');
        expect(screen.getByLabelText('Sunday Market collage')).toBeTruthy();
        // Picking a Fit stays below the photo.
        expect(screen.getByText('Change Fit')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Replace photo' })).toBeNull();
      });

      it('adds a photo to that wear from the camera or library, then refreshes the wear reads', async () => {
        wornMonday();
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));

        await waitFor(() =>
          expect(saveWearPhoto).toHaveBeenCalledWith('user-1', { id: MON_WEAR, photo: null }, 'file://picked.jpg'),
        );
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fitWearsRange', 'user-1'] }));
        // The sheet stays open on the day.
        expect(within(screen.getByTestId('day-fit-header')).getByText('Worn')).toBeTruthy();
      });

      it('shows the picked photo under a "Saving" veil and ignores every control until it lands', async () => {
        wornMonday();
        let resolve: () => void = () => {};
        (saveWearPhoto as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));
        await waitFor(() => expect(screen.getByText('Saving')).toBeTruthy());
        expect(imageProp(screen.getByTestId('wear-photo-full'), 'source')).toMatchObject({ uri: 'file://picked.jpg' });

        await user.press(screen.getByRole('button', { name: 'Office Day' }));
        await user.press(screen.getByRole('button', { name: 'Close' }));

        expect(planFit).not.toHaveBeenCalled();
        expect(within(screen.getByTestId('day-fit-header')).getByText('Worn')).toBeTruthy();
        await act(async () => resolve());
        await waitFor(() => expect(screen.queryByText('Saving')).toBeNull());
      });

      it("shows the wear's full photo with Replace and Remove", async () => {
        wornMonday(PHOTO);
        (useWearPhotoUrls as jest.Mock).mockImplementation((paths: string[]) => ({
          data: Object.fromEntries(paths.map((path) => [path, `https://signed/${path}`])),
        }));

        await openMonday();

        const photo = screen.getByTestId('wear-photo-full');
        expect(imageProp(photo, 'source')).toEqual({ uri: `https://signed/${PHOTO.path}`, cacheKey: PHOTO.path });
        expect(imageProp(photo, 'placeholder')).toEqual({ uri: thumbhashUri('hash-mon') });
        expect(screen.getByLabelText('Your photo from Monday, Sep 22')).toBeTruthy();
        expect(useWearPhotoUrls).toHaveBeenCalledWith([PHOTO.path]);
        expect(screen.getByRole('button', { name: 'Replace photo' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Remove photo' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
      });

      it('replaces the photo, handing the save the old one to clean up', async () => {
        wornMonday(PHOTO);
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Replace photo' }));

        await waitFor(() =>
          expect(saveWearPhoto).toHaveBeenCalledWith('user-1', { id: MON_WEAR, photo: PHOTO }, 'file://picked.jpg'),
        );
      });

      it('asks before removing the photo, and removes it on confirm', async () => {
        wornMonday(PHOTO);
        const confirm = mockConfirm(0);
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Remove photo' }));

        expect(confirm).toHaveBeenCalledWith(
          { options: ['Remove photo', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
          expect.any(Function),
        );
        await waitFor(() => expect(removeWearPhoto).toHaveBeenCalledWith({ id: MON_WEAR, photo: PHOTO }));
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fitWearsRange', 'user-1'] }));
      });

      it('keeps the photo when the removal is cancelled', async () => {
        wornMonday(PHOTO);
        mockConfirm(1);
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Remove photo' }));

        expect(removeWearPhoto).not.toHaveBeenCalled();
      });

      it('changes nothing when the picker is cancelled', async () => {
        wornMonday();
        (pickWearPhoto as jest.Mock).mockResolvedValue({ cancelled: true });
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));

        await waitFor(() => expect(pickWearPhoto).toHaveBeenCalledWith('library'));
        expect(saveWearPhoto).not.toHaveBeenCalled();
        expect(screen.queryByText('Saving')).toBeNull();
      });

      it('keeps the photo and shows the no-connection notice, unreported, when the save fails offline', async () => {
        wornMonday(PHOTO);
        (saveWearPhoto as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Replace photo' }));

        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Replace photo' })).toBeTruthy();
        expect(screen.queryByText('Saving')).toBeNull();
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('shows the unknown-error notice and reports when the row update fails', async () => {
        wornMonday();
        (saveWearPhoto as jest.Mock).mockRejectedValue(new Error('update failed'));
        const { user } = await openMonday();

        await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));

        expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add a photo of what you wore' })).toBeTruthy();
        expect(Sentry.captureException).toHaveBeenCalled();
      });

      it('has no photo section on a planned day not worn', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));

        expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
        expect(screen.getByText('Change Fit')).toBeTruthy();
      });

      it('has no photo section on a past day never marked worn', async () => {
        mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Monday, Sep 22: Sunday Market'));

        expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
      });

      it("has no photo section when a different Fit than the day's plan was worn", async () => {
        mockPlans([{ planned_on: TUE, fit_id: 'fit-a' }]);
        mockWears([`fit-b|${TUE}`]);
        const { user } = await renderPlanner();

        await user.press(row('Tuesday, Sep 23: Sunday Market'));

        expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
      });
    });

    describe('week rows', () => {
      it("shows a worn day's photo thumbnail instead of the collage, still captioned Worn", async () => {
        wornMonday(PHOTO);
        (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: { [PHOTO.thumbPath]: 'https://signed/thumb' } });

        await renderPlanner();

        const photo = screen.getByTestId(`planner-photo-${MON}`);
        expect(imageProp(photo, 'source')).toEqual({ uri: 'https://signed/thumb', cacheKey: PHOTO.thumbPath });
        expect(imageProp(photo, 'placeholder')).toEqual({ uri: thumbhashUri('hash-mon') });
        expect(photo.props.cachePolicy).toBe('memory-disk');
        expect(within(row('Monday, Sep 22: Sunday Market')).getByText('Worn')).toBeTruthy();
        // Tiles only ever load thumbnails.
        expect(useWearPhotoUrls).toHaveBeenCalledWith([PHOTO.thumbPath]);
        expect(useWearPhotoUrls).not.toHaveBeenCalledWith(expect.arrayContaining([PHOTO.path]));
      });

      it('keeps the collage on a worn day without a photo', async () => {
        wornMonday();

        await renderPlanner();

        expect(screen.queryByTestId(`planner-photo-${MON}`)).toBeNull();
        expect(screen.getByTestId(`planner-tile-${MON}`)).toBeTruthy();
      });
    });
  });

  describe("day sheet's Fit header (Story 5.6)", () => {
    const WED_KEY = `fit-a|${WED}`;
    const WED_WEAR = `wear-${WED_KEY}`;
    const WED_PHOTO: WearPhoto = {
      path: `user-1/${WED_WEAR}/p.webp`,
      thumbPath: `user-1/${WED_WEAR}/p_thumb.webp`,
      thumbhash: 'hash-wed',
    };

    function header() {
      return screen.getByTestId('day-fit-header');
    }

    function headerButton(name: string) {
      return within(header()).getByRole('button', { name });
    }

    /** Fit A planned today; worn today too when `worn`, with the photo if given. Week wears and today's wears agree. */
    function plannedToday({ worn = false, photo }: { worn?: boolean; photo?: WearPhoto } = {}) {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWears(worn ? [WED_KEY] : [], {}, photo ? { [WED_KEY]: photo } : {});
      mockTodayWorn(worn ? ['fit-a'] : [], {}, photo ? { 'fit-a': photo } : {});
    }

    async function openToday() {
      const rendered = await renderPlanner();
      await rendered.user.press(row('Wednesday, Sep 24: Sunday Market'));
      return rendered;
    }

    function mockConfirm(buttonIndex: number) {
      return jest
        .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
        .mockImplementation((_options, callback) => callback(buttonIndex));
    }

    afterEach(() => {
      (ActionSheetIOS.showActionSheetWithOptions as unknown as Partial<jest.SpyInstance>).mockRestore?.();
    });

    describe('planned day', () => {
      it('leads with the Fit: collage, name, status and View Fit, with the grid under "Change Fit"', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-b' }]);
        mockWearCounts([['fit-b', 2]]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Office Day'));

        expect(screen.getByText('Thursday, Sep 25')).toBeTruthy();
        expect(within(header()).getByText('Office Day')).toBeTruthy();
        expect(within(header()).getByText('Planned · Worn 2×')).toBeTruthy();
        expect(headerButton('View Fit')).toBeTruthy();
        // The collage fills like the grid tiles: the Fit's canvas color, or the raised surface.
        expect(StyleSheet.flatten(within(header()).getByTestId('day-fit-header-collage').props.style)).toMatchObject({
          backgroundColor: '#DCE8DC',
        });
        expect(screen.getByText('Change Fit')).toBeTruthy();
        expect(screen.queryByText('Choose a Fit')).toBeNull();
        expect(screen.getByTestId('plan-sheet-check-fit-b')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Remove from Thursday' })).toBeTruthy();
      });

      it('fills the collage with the raised surface for a Fit with no canvas color', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));

        expect(within(header()).getByTestId('day-fit-header-collage').props.className).toContain('bg-surface-raised');
      });

      it('reads just "Planned" for a Fit never worn', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));

        expect(within(header()).getByText('Planned')).toBeTruthy();
      });

      it('still plans another Fit from the grid in one tap', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));
        await user.press(screen.getByRole('button', { name: 'Office Day' }));

        await waitFor(() => expect(screen.queryByTestId('day-fit-header')).toBeNull());
        expect(planFit).toHaveBeenCalledWith('user-1', THU, 'fit-b');
      });

      it('shows the header on a planned day in the month view too', async () => {
        mockToday = '2026-09-26';
        mockMonthPlans([{ planned_on: '2026-09-29', fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();
        await user.press(screen.getByRole('button', { name: 'Month' }));

        await user.press(screen.getByRole('button', { name: 'Tuesday, Sep 29: Sunday Market, planned' }));

        expect(within(header()).getByText('Sunday Market')).toBeTruthy();
        expect(headerButton('View Fit')).toBeTruthy();
        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
      });
    });

    describe('not today', () => {
      it('offers no Mark worn on a future day', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));

        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
        expect(within(header()).queryByRole('button', { name: 'Worn today. Tap to undo' })).toBeNull();
      });

      it('offers no Mark worn on a past day never worn', async () => {
        mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Monday, Sep 22: Sunday Market'));

        expect(within(header()).getByText('Planned')).toBeTruthy();
        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
      });

      it('offers no undo on a past worn day, reading plain "Worn" with no count', async () => {
        mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
        mockWears([`fit-a|${MON}`]);
        mockWearCounts([['fit-a', 3]]);
        const { user } = await renderPlanner();

        await user.press(row('Monday, Sep 22: Sunday Market'));

        expect(within(header()).getByText('Worn')).toBeTruthy();
        expect(within(header()).queryByText(/Worn 3×/)).toBeNull();
        expect(within(header()).queryByRole('button', { name: 'Worn today. Tap to undo' })).toBeNull();
        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
      });
    });

    describe('worn day', () => {
      it('drops the collage when the photo section shows, keeping name, status and View Fit', async () => {
        mockPlans([{ planned_on: MON, fit_id: 'fit-a' }]);
        mockWears([`fit-a|${MON}`]);
        const { user } = await renderPlanner();

        await user.press(row('Monday, Sep 22: Sunday Market'));

        expect(screen.getByRole('button', { name: 'Add a photo of what you wore' })).toBeTruthy();
        expect(within(header()).queryByTestId('day-fit-header-collage')).toBeNull();
        expect(within(header()).getByText('Sunday Market')).toBeTruthy();
        expect(within(header()).getByText('Worn')).toBeTruthy();
        expect(headerButton('View Fit')).toBeTruthy();
        // The approved photo-plus-collage pair stays as it is.
        expect(screen.getByLabelText('Sunday Market collage')).toBeTruthy();
      });

      it('leads with the worn Fit on a day worn with nothing planned: "Worn", nothing checked, no Remove', async () => {
        mockWears([`fit-b|${TUE}`]);
        mockWearCounts([['fit-b', 2]]);
        const { user } = await renderPlanner();

        await user.press(row('Tuesday, Sep 23: nothing planned'));

        expect(screen.getByText('Tuesday, Sep 23')).toBeTruthy();
        expect(within(header()).queryByText(/Worn 2×/)).toBeNull();

        expect(within(header()).getByText('Office Day')).toBeTruthy();
        expect(within(header()).getByText('Worn')).toBeTruthy();
        expect(headerButton('View Fit')).toBeTruthy();
        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
        expect(screen.queryByTestId(/^plan-sheet-check-/)).toBeNull();
        expect(screen.queryByText('Remove from Tuesday')).toBeNull();
        expect(screen.getByText('Choose a Fit')).toBeTruthy();
        expect(screen.queryByText('Change Fit')).toBeNull();
      });

      it('offers Worn today on today when worn with nothing planned, reading plain "Worn", and undoes that wear', async () => {
        mockWears([`fit-b|${WED}`]);
        mockTodayWorn(['fit-b']);
        mockWearCounts([['fit-b', 4]]);
        const { user } = await renderPlanner();

        await user.press(row('Wednesday, Sep 24: nothing planned'));

        expect(within(header()).getByText('Office Day')).toBeTruthy();
        expect(within(header()).getByText('Worn')).toBeTruthy();
        expect(within(header()).queryByText(/including today/)).toBeNull();
        expect(within(header()).queryByText(/Worn 4×/)).toBeNull();
        expect(screen.getByText('Choose a Fit')).toBeTruthy();
        await user.press(headerButton('Worn today. Tap to undo'));

        await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-b'));
      });

      it("captions today's worn planned day with just the day, the grid under Change Fit", async () => {
        plannedToday({ worn: true });
        await openToday();

        expect(screen.getByText('Wednesday, Sep 24')).toBeTruthy();
        expect(screen.queryByText('Choose a Fit')).toBeNull();
        expect(screen.getByText('Change Fit')).toBeTruthy();
      });
    });

    describe('empty day', () => {
      it('opens straight on the grid with no header', async () => {
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: nothing planned'));

        expect(screen.queryByTestId('day-fit-header')).toBeNull();
        expect(screen.queryByRole('button', { name: 'View Fit' })).toBeNull();
        expect(screen.getByText('Choose a Fit')).toBeTruthy();
      });

      it('has no header for a plan whose Fit was deleted', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-deleted' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: nothing planned'));

        expect(screen.queryByTestId('day-fit-header')).toBeNull();
      });
    });

    describe('View Fit', () => {
      it('closes the sheet and opens Fit detail', async () => {
        mockPlans([{ planned_on: THU, fit_id: 'fit-b' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Office Day'));
        await user.press(headerButton('View Fit'));

        expect(screen.queryByTestId('day-fit-header')).toBeNull();
        expect(screen.queryByText('Change Fit')).toBeNull();
        expect(router.push).toHaveBeenCalledWith('/fit/fit-b');
      });

      it('is ignored while a write is in flight', async () => {
        let resolve: () => void = () => {};
        (planFit as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
        const { user } = await renderPlanner();

        await user.press(row('Thursday, Sep 25: Sunday Market'));
        await user.press(screen.getByRole('button', { name: 'Office Day' }));
        await user.press(headerButton('View Fit'));

        expect(router.push).not.toHaveBeenCalled();
        expect(screen.getByTestId('day-fit-header')).toBeTruthy();
        await act(async () => resolve());
      });
    });

    describe('Mark worn today', () => {
      it("keeps a worn day's photo section and offers no Mark worn while today's wears load", async () => {
        plannedToday({ worn: true });
        mockTodayWorn([], { data: undefined, isLoading: true });

        await openToday();

        expect(screen.getByRole('button', { name: 'Add a photo of what you wore' })).toBeTruthy();
        expect(within(header()).queryByRole('button', { name: 'Mark worn' })).toBeNull();
        expect(within(header()).queryByRole('button', { name: 'Worn today. Tap to undo' })).toBeNull();
      });

      it("reads Home's status for today's planned Fit", async () => {
        plannedToday();
        mockWearCounts([['fit-a', 3]]);

        await openToday();

        expect(within(header()).getByText('Planned for today · Worn 3×')).toBeTruthy();
        expect(headerButton('Mark worn')).toBeTruthy();
      });

      it("reads Home's worn status once today's Fit is worn", async () => {
        plannedToday({ worn: true });
        mockWearCounts([['fit-a', 4]]);

        await openToday();

        expect(within(header()).getByText('Worn 4× · including today')).toBeTruthy();
        expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
      });

      it('flips at once, writes, tracks source planner and invalidates every wear read', async () => {
        let resolve: () => void = () => {};
        (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        plannedToday();
        mockWearCounts([['fit-a', 3]]);
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        const { user } = await openToday();

        await user.press(headerButton('Mark worn'));

        expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
        expect(within(header()).getByText('Worn 4× · including today')).toBeTruthy();
        expect(markFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');
        // The sheet stays open on the day.
        expect(screen.getByText('Wednesday, Sep 24')).toBeTruthy();

        await act(async () => resolve());
        await waitFor(() => expect(trackFitWorn).toHaveBeenCalledWith('planner'));
        for (const key of ['wornFitIds', 'todayWornFitIds', 'fitWearsRange', 'wearDates', 'fitWearPhotos']) {
          expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, 'user-1'] });
        }
      });

      it('shows the photo slot, and drops the collage, once the wear lands', async () => {
        plannedToday();
        (markFitWornToday as jest.Mock).mockImplementation(async () => {
          // The refetch after the write now finds today's wear.
          plannedToday({ worn: true });
        });
        const { user } = await openToday();
        expect(within(header()).getByTestId('day-fit-header-collage')).toBeTruthy();

        await user.press(headerButton('Mark worn'));

        expect(await screen.findByRole('button', { name: 'Add a photo of what you wore' })).toBeTruthy();
        expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
        expect(within(header()).queryByTestId('day-fit-header-collage')).toBeNull();
      });

      it('undoes a wear without a photo in one tap', async () => {
        const confirm = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
        let resolve: () => void = () => {};
        (unmarkFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        plannedToday({ worn: true });
        const { user } = await openToday();
        expect(screen.getByRole('button', { name: 'Add a photo of what you wore' })).toBeTruthy();

        await user.press(headerButton('Worn today. Tap to undo'));

        expect(headerButton('Mark worn')).toBeTruthy();
        // The photo section goes at once, before the unmark lands.
        expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
        expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');
        expect(confirm).not.toHaveBeenCalled();
        await act(async () => resolve());
        expect(trackFitWorn).not.toHaveBeenCalled();
      });

      it('asks before undoing a wear that has a photo, and undoes on confirm', async () => {
        plannedToday({ worn: true, photo: WED_PHOTO });
        const confirm = mockConfirm(0);
        const { user } = await openToday();

        await user.press(headerButton('Worn today. Tap to undo'));

        expect(confirm).toHaveBeenCalledWith(
          {
            title: "Undo today's wear? Its photo will be deleted.",
            options: ['Undo wear', 'Cancel'],
            destructiveButtonIndex: 0,
            cancelButtonIndex: 1,
          },
          expect.any(Function),
        );
        await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a'));
      });

      it('keeps the wear and its photo on Cancel', async () => {
        plannedToday({ worn: true, photo: WED_PHOTO });
        mockConfirm(1);
        const { user } = await openToday();

        await user.press(headerButton('Worn today. Tap to undo'));

        expect(unmarkFitWornToday).not.toHaveBeenCalled();
        expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Replace photo' })).toBeTruthy();
      });

      it('reverts and shows the no-connection notice in the sheet, unreported, when Mark worn fails offline', async () => {
        (markFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        plannedToday();
        const { user } = await openToday();

        await user.press(headerButton('Mark worn'));

        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
        expect(headerButton('Mark worn')).toBeTruthy();
        expect(trackFitWorn).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('reverts and reports an unknown undo failure with the notice in the sheet', async () => {
        (unmarkFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
        plannedToday({ worn: true });
        const { user } = await openToday();

        await user.press(headerButton('Worn today. Tap to undo'));

        expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
        expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
        expect(Sentry.captureException).toHaveBeenCalled();
      });
    });

    describe('busy', () => {
      it('ignores every control in the sheet while a wear write is in flight', async () => {
        let resolve: () => void = () => {};
        (markFitWornToday as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        plannedToday();
        const { user } = await openToday();

        await user.press(headerButton('Mark worn'));
        await user.press(headerButton('Worn today. Tap to undo'));
        await user.press(headerButton('View Fit'));
        await user.press(screen.getByRole('button', { name: 'Office Day' }));
        await user.press(screen.getByRole('button', { name: 'Remove from Wednesday' }));
        await user.press(screen.getByRole('button', { name: 'Close' }));

        expect(markFitWornToday).toHaveBeenCalledTimes(1);
        expect(unmarkFitWornToday).not.toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
        expect(planFit).not.toHaveBeenCalled();
        expect(unplanDay).not.toHaveBeenCalled();
        expect(screen.getByTestId('day-fit-header')).toBeTruthy();
        await act(async () => resolve());
      });

      it('ignores Mark worn while a plan write is in flight', async () => {
        let resolve: () => void = () => {};
        (planFit as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        plannedToday();
        const { user } = await openToday();

        await user.press(screen.getByRole('button', { name: 'Office Day' }));
        await user.press(headerButton('Mark worn'));

        expect(markFitWornToday).not.toHaveBeenCalled();
        await act(async () => resolve());
      });

      it('ignores Worn today while a photo write is in flight', async () => {
        let resolve: () => void = () => {};
        (saveWearPhoto as jest.Mock).mockReturnValue(new Promise<void>((r) => (resolve = r)));
        plannedToday({ worn: true });
        const { user } = await openToday();

        await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));
        await waitFor(() => expect(screen.getByText('Saving')).toBeTruthy());
        await user.press(headerButton('Worn today. Tap to undo'));

        expect(unmarkFitWornToday).not.toHaveBeenCalled();
        await act(async () => resolve());
      });
    });
  });

  describe('month view', () => {
    // Sat Sep 26 2026, the month on the approved P4Month board.
    const SEP_10 = '2026-09-10';
    const SEP_11 = '2026-09-11';
    const SEP_16 = '2026-09-16';
    const SEP_29 = '2026-09-29';

    beforeEach(() => {
      mockToday = '2026-09-26';
    });

    async function openMonth() {
      const rendered = await renderPlanner();
      await rendered.user.press(screen.getByRole('button', { name: 'Month' }));
      return rendered;
    }

    function day(label: string) {
      return screen.getByRole('button', { name: label });
    }

    function focusTab() {
      const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
      return act(async () => onFocus());
    }

    describe('switcher', () => {
      it('switches to the month, remembers it, and pages by month', async () => {
        const { user } = await openMonth();

        expect(screen.getByText('September 2026')).toBeTruthy();
        expect(screen.getByRole('header', { name: 'Planner' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Month' }).props.accessibilityState).toMatchObject({ selected: true });
        expect(screen.getByRole('button', { name: 'Week' }).props.accessibilityState).toMatchObject({ selected: false });
        expect(usePlannedMonth).toHaveBeenLastCalledWith('user-1', '2026-09-01', true);
        expect(useMonthWears).toHaveBeenLastCalledWith('user-1', '2026-09-01', true);
        expect(savePlannerView).toHaveBeenCalledWith('month');
        expect(screen.queryByTestId('planner-week')).toBeNull();

        await user.press(screen.getByRole('button', { name: 'Next month' }));
        expect(screen.getByText('October 2026')).toBeTruthy();
        expect(usePlannedMonth).toHaveBeenLastCalledWith('user-1', '2026-10-01', true);

        await user.press(screen.getByRole('button', { name: 'Previous month' }));
        await user.press(screen.getByRole('button', { name: 'Previous month' }));
        expect(screen.getByText('August 2026')).toBeTruthy();
      });

      it("doesn't read the month while the week is showing", async () => {
        await renderPlanner();

        expect(usePlannedMonth).toHaveBeenLastCalledWith('user-1', '2026-09-01', false);
        expect(useMonthWears).toHaveBeenLastCalledWith('user-1', '2026-09-01', false);
      });

      it("opens on the month of the visible week's Monday", async () => {
        const { user } = await renderPlanner();

        // Sep 28 – Oct 4 starts in September.
        await user.press(screen.getByRole('button', { name: 'Next week' }));
        await user.press(screen.getByRole('button', { name: 'Month' }));
        expect(screen.getByText('September 2026')).toBeTruthy();

        await user.press(screen.getByRole('button', { name: 'Week' }));
        await user.press(screen.getByRole('button', { name: 'Next week' }));
        await user.press(screen.getByRole('button', { name: 'Next week' }));
        await user.press(screen.getByRole('button', { name: 'Month' }));
        expect(screen.getByText('October 2026')).toBeTruthy();
      });

      it("goes back to today's week from today's month, remembering the week", async () => {
        const { user } = await openMonth();

        await user.press(screen.getByRole('button', { name: 'Week' }));

        expect(screen.getByText('Sep 21 – 27')).toBeTruthy();
        expect(screen.getByTestId('planner-week')).toBeTruthy();
        expect(savePlannerView).toHaveBeenLastCalledWith('week');
      });

      it("goes back to another month's first week", async () => {
        const { user } = await openMonth();

        await user.press(screen.getByRole('button', { name: 'Next month' }));
        await user.press(screen.getByRole('button', { name: 'Week' }));

        expect(screen.getByText('Sep 28 – Oct 4')).toBeTruthy();
      });

      it('opens on the remembered month view, on the current month', async () => {
        (loadPlannerView as jest.Mock).mockResolvedValue('month');

        await renderPlanner();

        expect(await screen.findByText('September 2026')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Month' }).props.accessibilityState).toMatchObject({ selected: true });
        expect(savePlannerView).not.toHaveBeenCalled();
      });

      it('shows the skeleton, not the week, until the remembered view is known', async () => {
        (loadPlannerView as jest.Mock).mockReturnValue(new Promise(() => {}));

        await renderPlanner();

        expect(screen.getByTestId('planner-skeleton', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('planner-week')).toBeNull();
      });

      it('follows today into the next month on focus when showing the current month', async () => {
        await openMonth();

        mockToday = '2026-10-01';
        await focusTab();

        expect(screen.getByText('October 2026')).toBeTruthy();
      });

      it('keeps a month the user paged to when the day rolls over', async () => {
        const { user } = await openMonth();
        await user.press(screen.getByRole('button', { name: 'Previous month' }));

        mockToday = '2026-10-01';
        await focusTab();

        expect(screen.getByText('August 2026')).toBeTruthy();
      });

      it('does not refetch the month on focus while the week is showing', async () => {
        const refetchPlans = jest.fn();
        const refetchWears = jest.fn();
        mockMonthPlans([], { refetch: refetchPlans });
        mockMonthWears([], { refetch: refetchWears });
        const { user } = await openMonth();
        await user.press(screen.getByRole('button', { name: 'Week' }));

        await focusTab();

        expect(refetchPlans).not.toHaveBeenCalled();
        expect(refetchWears).not.toHaveBeenCalled();
      });

      it('refetches the month plans and wears when the tab regains focus', async () => {
        const refetchPlans = jest.fn();
        const refetchWears = jest.fn();
        mockMonthPlans([], { refetch: refetchPlans });
        mockMonthWears([], { refetch: refetchWears });
        await openMonth();

        await focusTab();

        expect(refetchPlans).toHaveBeenCalled();
        expect(refetchWears).toHaveBeenCalled();
      });
    });

    describe('grid', () => {
      it('shows only the days of the month, labelled with their plan', async () => {
        await openMonth();

        expect(within(screen.getByTestId('planner-month')).getAllByRole('button')).toHaveLength(30);
        expect(day('Tuesday, Sep 1: nothing planned')).toBeTruthy();
        expect(day('Wednesday, Sep 30: nothing planned')).toBeTruthy();
        expect(day('Saturday, Sep 26, today: nothing planned')).toBeTruthy();
        expect(screen.getByText('Worn')).toBeTruthy();
      });

      it('badges a planned Fit that was worn that day', async () => {
        mockMonthPlans([{ planned_on: SEP_11, fit_id: 'fit-a' }]);
        mockMonthWears([`fit-a|${SEP_11}`]);

        await openMonth();

        expect(day('Friday, Sep 11: Sunday Market, worn')).toBeTruthy();
        expect(screen.getByTestId(`planner-month-worn-${SEP_11}`)).toBeTruthy();
      });

      it('shows a Fit worn without a plan, badged', async () => {
        mockMonthWears([`fit-b|${SEP_16}`]);

        await openMonth();

        expect(day('Wednesday, Sep 16: Office Day, worn')).toBeTruthy();
        expect(screen.getByTestId(`planner-month-worn-${SEP_16}`)).toBeTruthy();
      });

      it('shows a planned Fit not yet worn without a badge', async () => {
        mockMonthPlans([{ planned_on: SEP_29, fit_id: 'fit-a' }]);

        await openMonth();

        expect(day('Tuesday, Sep 29: Sunday Market, planned')).toBeTruthy();
        expect(screen.queryByTestId(`planner-month-worn-${SEP_29}`)).toBeNull();
      });

      it('shows the planned Fit, unbadged, when a different Fit was worn that day', async () => {
        mockMonthPlans([{ planned_on: SEP_11, fit_id: 'fit-a' }]);
        mockMonthWears([`fit-b|${SEP_11}`]);

        await openMonth();

        expect(day('Friday, Sep 11: Sunday Market, planned')).toBeTruthy();
        expect(screen.queryByTestId(`planner-month-worn-${SEP_11}`)).toBeNull();
      });

      it('shows the first live Fit in list order when several were worn without a plan', async () => {
        mockMonthWears([`fit-b|${SEP_16}`, `fit-a|${SEP_16}`]);

        await openMonth();

        expect(day('Wednesday, Sep 16: Sunday Market, worn')).toBeTruthy();
      });

      it("treats a deleted Fit's plan or wear as nothing", async () => {
        mockMonthPlans([{ planned_on: SEP_10, fit_id: 'fit-deleted' }]);
        mockMonthWears([`fit-deleted|${SEP_16}`]);

        await openMonth();

        expect(day('Thursday, Sep 10: nothing planned')).toBeTruthy();
        expect(day('Wednesday, Sep 16: nothing planned')).toBeTruthy();
      });

      it("fills a tile with the Fit's canvas color, or the raised surface", async () => {
        mockMonthPlans([
          { planned_on: SEP_10, fit_id: 'fit-a' },
          { planned_on: SEP_11, fit_id: 'fit-b' },
        ]);

        await openMonth();

        expect(screen.getByTestId(`planner-month-tile-${SEP_10}`).props.className).toContain('bg-surface-raised');
        expect(StyleSheet.flatten(screen.getByTestId(`planner-month-tile-${SEP_11}`).props.style)).toMatchObject({
          backgroundColor: '#DCE8DC',
        });
      });

      it('keeps a dashed slot for every empty day, so empty weeks keep their height', async () => {
        mockMonthPlans([{ planned_on: SEP_11, fit_id: 'fit-a' }]);

        await openMonth();

        expect(screen.getAllByTestId(/^planner-month-empty-/)).toHaveLength(29);
        expect(screen.queryByTestId(`planner-month-empty-${SEP_11}`)).toBeNull();
        expect(screen.getByTestId(`planner-month-empty-${SEP_10}`).props.className).toContain('border-dashed');
        expect(screen.getByTestId(`planner-month-empty-${SEP_10}`).props.style).toMatchObject({ aspectRatio: 3 / 4 });
      });

      describe('wear photos', () => {
        function photoFor(key: string): WearPhoto {
          return { path: `user-1/wear-${key}/p.webp`, thumbPath: `user-1/wear-${key}/p_thumb.webp`, thumbhash: `hash-${key}` };
        }

        it('shows the photo instead of the collage on a worn day with one, keeping the worn check', async () => {
          const key = `fit-a|${SEP_11}`;
          const photo = photoFor(key);
          mockMonthPlans([{ planned_on: SEP_11, fit_id: 'fit-a' }]);
          mockMonthWears([key], {}, { [key]: photo });
          (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: { [photo.thumbPath]: 'https://signed/thumb-11' } });

          await openMonth();

          expect(day('Friday, Sep 11: Sunday Market, worn, with your photo')).toBeTruthy();
          const image = screen.getByTestId(`planner-month-photo-${SEP_11}`);
          expect(imageProp(image, 'source')).toEqual({ uri: 'https://signed/thumb-11', cacheKey: photo.thumbPath });
          expect(imageProp(image, 'placeholder')).toEqual({ uri: thumbhashUri(`hash-${key}`) });
          expect(image.props.cachePolicy).toBe('memory-disk');
          expect(image.props.recyclingKey).toBe(SEP_11);
          expect(screen.getByTestId(`planner-month-worn-${SEP_11}`)).toBeTruthy();
          expect(screen.queryByTestId(`planner-month-tile-${SEP_11}`)).toBeNull();
        });

        it('keeps the collage on a worn day without a photo', async () => {
          mockMonthWears([`fit-b|${SEP_16}`]);

          await openMonth();

          expect(screen.getByTestId(`planner-month-tile-${SEP_16}`)).toBeTruthy();
          expect(screen.queryByTestId(`planner-month-photo-${SEP_16}`)).toBeNull();
        });

        it("signs only the visible month's thumbnails, never a full photo", async () => {
          const keys = [`fit-a|${SEP_11}`, `fit-b|${SEP_16}`];
          mockMonthWears(keys, {}, Object.fromEntries(keys.map((key) => [key, photoFor(key)])));

          await openMonth();

          const requested = (useWearPhotoUrls as jest.Mock).mock.calls.at(-1)[0] as string[];
          expect([...requested].sort()).toEqual(keys.map((key) => photoFor(key).thumbPath).sort());
        });

        it('keys 30 photo tiles by storage path, so a second view is served from the disk cache', async () => {
          const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
          const keys = dates.map((date) => `fit-a|${date}`);
          const photos = Object.fromEntries(keys.map((key) => [key, photoFor(key)]));
          mockMonthWears(keys, {}, photos);
          let signing = 1;
          // Signed URLs change between views; the cache key must not.
          (useWearPhotoUrls as jest.Mock).mockImplementation((paths: string[]) => ({
            data: Object.fromEntries(paths.map((path) => [path, `https://signed/${signing}/${path}`])),
          }));
          const { user } = await openMonth();

          const cacheKeys = () => dates.map((date) => imageProp(screen.getByTestId(`planner-month-photo-${date}`), 'source')?.cacheKey);
          const firstView = cacheKeys();
          expect(firstView).toEqual(keys.map((key) => photos[key].thumbPath));

          signing = 2;
          await user.press(screen.getByRole('button', { name: 'Next month' }));
          await user.press(screen.getByRole('button', { name: 'Previous month' }));

          expect(imageProp(screen.getByTestId(`planner-month-photo-${dates[0]}`), 'source')?.uri).toContain('/2/');
          expect(cacheKeys()).toEqual(firstView);
          for (const date of dates) {
            expect(screen.getByTestId(`planner-month-photo-${date}`).props.cachePolicy).toBe('memory-disk');
          }
        });

        it("opens a worn day's sheet from the month with its photo section", async () => {
          const key = `fit-b|${SEP_16}`;
          mockMonthWears([key]);
          const { user } = await openMonth();

          await user.press(day('Wednesday, Sep 16: Office Day, worn'));
          await user.press(screen.getByRole('button', { name: 'Add a photo of what you wore' }));

          expect(within(screen.getByTestId('day-fit-header')).getByText('Office Day')).toBeTruthy();
          await waitFor(() =>
            expect(saveWearPhoto).toHaveBeenCalledWith('user-1', { id: `wear-${key}`, photo: null }, 'file://picked.jpg'),
          );
        });
      });

      it("inks today's empty slot", async () => {
        await openMonth();

        expect(screen.getByTestId('planner-month-empty-2026-09-26').props.className).toMatch(/(^| )border-ink-primary( |$)/);
        expect(screen.getByTestId(`planner-month-empty-${SEP_10}`).props.className).not.toMatch(/(^| )border-ink-primary( |$)/);
      });

      it('marks today with an ink date and an ink tile border, and mutes past dates', async () => {
        mockMonthPlans([{ planned_on: '2026-09-26', fit_id: 'fit-a' }]);

        await openMonth();

        expect(within(day('Saturday, Sep 26, today: Sunday Market, planned')).getByTestId('planner-month-today')).toBeTruthy();
        expect(screen.getAllByTestId('planner-month-today')).toHaveLength(1);
        expect(screen.getByTestId('planner-month-tile-2026-09-26').props.className).toMatch(/(^| )border-ink-primary( |$)/);
        expect(screen.getByText('25').props.className).toMatch(/(^| )text-ink-secondary( |$)/);
        expect(screen.getByText('27').props.className).toMatch(/(^| )text-ink-primary( |$)/);
      });
    });

    describe('day sheet', () => {
      it('opens for the tapped day with its planned Fit selected, and replaces it', async () => {
        mockMonthPlans([{ planned_on: SEP_29, fit_id: 'fit-a' }]);
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
        const { user } = await openMonth();

        await user.press(day('Tuesday, Sep 29: Sunday Market, planned'));

        expect(screen.getByText('Change Fit')).toBeTruthy();
        expect(screen.getByText('Tuesday, Sep 29')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sunday Market' }).props.accessibilityState).toMatchObject({ selected: true });
        await user.press(screen.getByRole('button', { name: 'Office Day' }));

        await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
        expect(planFit).toHaveBeenCalledWith('user-1', SEP_29, 'fit-b');
        expect(trackFitPlanned).toHaveBeenCalledWith(3);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plannedFits', 'user-1'] });
      });

      it("removes a day's Fit from the month", async () => {
        mockMonthPlans([{ planned_on: SEP_29, fit_id: 'fit-a' }]);
        const { user } = await openMonth();

        await user.press(day('Tuesday, Sep 29: Sunday Market, planned'));
        await user.press(screen.getByRole('button', { name: 'Remove from Tuesday' }));

        await waitFor(() => expect(unplanDay).toHaveBeenCalledWith(SEP_29));
      });

      it('opens a worn-only day with nothing selected and no Remove', async () => {
        mockMonthWears([`fit-b|${SEP_16}`]);
        const { user } = await openMonth();

        await user.press(day('Wednesday, Sep 16: Office Day, worn'));

        expect(screen.getByText('Wednesday, Sep 16')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Office Day' }).props.accessibilityState).toMatchObject({ selected: false });
        expect(screen.queryByText('Remove from Wednesday')).toBeNull();
      });

      it('stays open with the no-connection notice when a write fails offline', async () => {
        (planFit as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
        const { user } = await openMonth();

        await user.press(day('Tuesday, Sep 29: nothing planned'));
        await user.press(screen.getByRole('button', { name: 'Sunday Market' }));

        expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
        expect(screen.getByText('Choose a Fit')).toBeTruthy();
      });
    });

    describe('states', () => {
      it('shows the month skeleton while the month loads', async () => {
        mockMonthPlans([], { data: undefined, isLoading: true });

        await openMonth();

        expect(screen.getByTestId('planner-month-skeleton', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('planner-month')).toBeNull();
      });

      it('shows the month skeleton while the month wears load', async () => {
        mockMonthWears([], { data: undefined, isLoading: true });

        await openMonth();

        expect(screen.getByTestId('planner-month-skeleton', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('planner-month')).toBeNull();
      });

      it("sizes the skeleton to the month's weeks", async () => {
        // August 2026 spans six weeks.
        mockToday = '2026-08-15';
        mockMonthPlans([], { data: undefined, isLoading: true });

        await openMonth();

        const skeleton = screen.getByTestId('planner-month-skeleton', { includeHiddenElements: true });
        expect(skeleton.children).toHaveLength(6);
      });

      it('shows the error notice with Retry when the month plans fail to load', async () => {
        const refetch = jest.fn();
        const refetchWears = jest.fn();
        mockMonthPlans([], { data: undefined, isError: true, error: new Error('boom'), refetch });
        mockMonthWears([], { refetch: refetchWears });

        const { user } = await openMonth();

        expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
        expect(Sentry.captureException).toHaveBeenCalled();
        await user.press(screen.getByRole('button', { name: 'Retry' }));
        expect(refetch).toHaveBeenCalled();
        expect(refetchWears).toHaveBeenCalled();
      });

      it('fails open when the month wears fail: plans show, no badges, error reported', async () => {
        mockMonthPlans([{ planned_on: SEP_11, fit_id: 'fit-a' }]);
        mockMonthWears([], { data: undefined, isError: true, error: new Error('boom') });

        await openMonth();

        expect(day('Friday, Sep 11: Sunday Market, planned')).toBeTruthy();
        expect(screen.queryByTestId(`planner-month-worn-${SEP_11}`)).toBeNull();
        expect(Sentry.captureException).toHaveBeenCalled();
      });

      it('does not report a month wears read that failed offline', async () => {
        mockMonthWears([], { data: undefined, isError: true, error: new FitError('no_connection', NO_CONNECTION_MESSAGE) });

        await openMonth();

        expect(day('Tuesday, Sep 1: nothing planned')).toBeTruthy();
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('keeps the no-Fits screen in month view', async () => {
        (loadPlannerView as jest.Mock).mockResolvedValue('month');
        mockFits({ data: [] });

        await renderPlanner();

        expect(await screen.findByText('Nothing to plan yet.')).toBeTruthy();
        expect(screen.queryByTestId('planner-month')).toBeNull();
      });
    });
  });

  describe("opening a day from Fit detail's Worn strip (Story 5.5)", () => {
    it("shows the week holding the date, opens that day's sheet, and clears the param", async () => {
      mockParams = { date: '2025-09-11' };

      await renderPlanner();

      expect(await screen.findByText('Thursday, Sep 11')).toBeTruthy();
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      expect(screen.getByText('Sep 8 – 14')).toBeTruthy();
      expect(usePlannedFits).toHaveBeenLastCalledWith('user-1', '2025-09-08');
      expect(router.setParams).toHaveBeenCalledWith({ date: undefined });
    });

    it('opens in the month view when that was the last one chosen, on the month holding the date', async () => {
      mockToday = '2026-09-26';
      (loadPlannerView as jest.Mock).mockResolvedValue('month');
      mockParams = { date: '2026-08-16' };

      await renderPlanner();

      expect(await screen.findByText('Sunday, Aug 16')).toBeTruthy();
      expect(screen.getByText('August 2026')).toBeTruthy();
      expect(usePlannedMonth).toHaveBeenLastCalledWith('user-1', '2026-08-01', true);
    });

    it('opens a date that arrives while the tab is already mounted', async () => {
      const { rerender } = await renderPlanner();
      expect(screen.queryByText('Choose a Fit')).toBeNull();

      mockParams = { date: '2025-09-19' };
      await rerender(
        <QueryClientProvider client={queryClient}>
          <Planner />
        </QueryClientProvider>,
      );

      expect(await screen.findByText('Friday, Sep 19')).toBeTruthy();
      expect(router.setParams).toHaveBeenCalledWith({ date: undefined });
    });

    it('opens the same day again when it comes back after being cleared', async () => {
      mockParams = { date: '2025-09-11' };
      const { rerender, user } = await renderPlanner();
      // A fresh element each time, so React re-renders rather than bailing out on the same one.
      const tree = () => (
        <QueryClientProvider client={queryClient}>
          <Planner />
        </QueryClientProvider>
      );
      expect(await screen.findByText('Thursday, Sep 11')).toBeTruthy();
      await user.press(screen.getByRole('button', { name: 'Close' }));
      mockParams = {};
      await rerender(tree());
      expect(screen.queryByText('Choose a Fit')).toBeNull();

      mockParams = { date: '2025-09-11' };
      await rerender(tree());

      expect(await screen.findByText('Thursday, Sep 11')).toBeTruthy();
    });

    it("waits for a day-sheet write to finish before switching days", async () => {
      let resolvePlan: () => void = () => {};
      (planFit as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolvePlan = resolve)));
      const { rerender, user } = await renderPlanner();
      const tree = () => (
        <QueryClientProvider client={queryClient}>
          <Planner />
        </QueryClientProvider>
      );
      await user.press(row('Thursday, Sep 25: nothing planned'));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));
      await waitFor(() => expect(planFit).toHaveBeenCalled());

      mockParams = { date: '2025-09-11' };
      await rerender(tree());

      expect(screen.getByText('Thursday, Sep 25')).toBeTruthy();
      expect(screen.queryByText('Thursday, Sep 11')).toBeNull();
      expect(router.setParams).not.toHaveBeenCalled();

      await act(async () => resolvePlan());

      expect(await screen.findByText('Thursday, Sep 11')).toBeTruthy();
      expect(screen.queryByText('Thursday, Sep 25')).toBeNull();
      expect(router.setParams).toHaveBeenCalledWith({ date: undefined });
    });

    it('ignores an invalid date, clearing it without opening anything', async () => {
      mockParams = { date: '2025-02-30' };

      await renderPlanner();

      await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ date: undefined }));
      expect(screen.queryByText('Choose a Fit')).toBeNull();
      expect(screen.getByText('Sep 22 – 28')).toBeTruthy();
    });

    it('waits for the remembered view before acting on the date', async () => {
      (loadPlannerView as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockParams = { date: '2025-09-11' };

      await renderPlanner();

      expect(router.setParams).not.toHaveBeenCalled();
    });
  });
});
