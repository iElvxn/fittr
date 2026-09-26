import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/planner/plannedFits', () => ({
  usePlannedFits: jest.fn(),
  useWeekWears: jest.fn(),
  planFit: jest.fn(),
  unplanDay: jest.fn(),
}));
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
import { planFit, unplanDay, usePlannedFits, useWeekWears } from '@/lib/planner/plannedFits';
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
});
