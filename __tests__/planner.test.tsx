import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

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
jest.mock('@/lib/analytics/posthog', () => ({ trackFitPlanned: jest.fn() }));
// Pins "today" to Wed Sep 24 2025 (the mockup's week) without faking timers; `toLocalDate` stays
// real so the week helpers still do their own date math.
let mockToday = '2025-09-24';
jest.mock('@/lib/fits/localDate', () => ({
  ...jest.requireActual('@/lib/fits/localDate'),
  todayLocalDate: () => mockToday,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import Planner from '@/app/(tabs)/planner';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { planFit, unplanDay, useMonthWears, usePlannedFits, usePlannedMonth, useWeekWears } from '@/lib/planner/plannedFits';
import { loadPlannerView, savePlannerView } from '@/lib/planner/viewPreference';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { trackFitPlanned } from '@/lib/analytics/posthog';
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

function mockWears(keys: string[], overrides: Record<string, unknown> = {}) {
  (useWeekWears as jest.Mock).mockReturnValue(query({ data: new Set(keys), ...overrides }));
}

function mockMonthPlans(plans: { planned_on: string; fit_id: string }[], overrides: Record<string, unknown> = {}) {
  (usePlannedMonth as jest.Mock).mockReturnValue(query({ data: plans, ...overrides }));
}

function mockMonthWears(keys: string[], overrides: Record<string, unknown> = {}) {
  (useMonthWears as jest.Mock).mockReturnValue(query({ data: new Set(keys), ...overrides }));
}

let queryClient: QueryClient;

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
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
    (planFit as jest.Mock).mockResolvedValue(undefined);
    (unplanDay as jest.Mock).mockResolvedValue(undefined);
    mockFits();
    mockPlans([]);
    mockWears([]);
    mockMonthPlans([]);
    mockMonthWears([]);
    (loadPlannerView as jest.Mock).mockResolvedValue('week');
    (savePlannerView as jest.Mock).mockResolvedValue(undefined);
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

    it('refetches the Fits, plans and wears when the tab regains focus', async () => {
      const refetchFits = jest.fn();
      const refetchPlans = jest.fn();
      const refetchWears = jest.fn();
      mockFits({ refetch: refetchFits });
      mockPlans([], { refetch: refetchPlans });
      mockWears([], { refetch: refetchWears });

      await renderPlanner();
      const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
      onFocus();

      expect(refetchFits).toHaveBeenCalled();
      expect(refetchPlans).toHaveBeenCalled();
      expect(refetchWears).toHaveBeenCalled();
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

      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
      expect(planFit).toHaveBeenCalledWith('user-1', THU, 'fit-b');
      expect(trackFitPlanned).toHaveBeenCalledWith(1);
    });

    it("just closes when the day's current Fit is tapped again, without writing or tracking", async () => {
      mockPlans([{ planned_on: THU, fit_id: 'fit-a' }]);
      const { user } = await renderPlanner();

      await user.press(row('Thursday, Sep 25: Sunday Market'));
      await user.press(screen.getByRole('button', { name: 'Sunday Market' }));

      expect(screen.queryByText('Choose a Fit')).toBeNull();
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

      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
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
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
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
      expect(screen.getByText('Choose a Fit')).toBeTruthy();

      await act(async () => resolve());
      await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
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

        expect(screen.getByText('Choose a Fit')).toBeTruthy();
        expect(screen.getByText('Tuesday, Sep 29')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sunday Market' }).props.accessibilityState).toMatchObject({ selected: true });
        await user.press(screen.getByRole('button', { name: 'Office Day' }));

        await waitFor(() => expect(screen.queryByText('Choose a Fit')).toBeNull());
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
});
