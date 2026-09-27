import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionSheetIOS, Alert, AppState, ScrollView, StyleSheet } from 'react-native';

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
jest.mock('@/lib/fits/wearPhoto', () => ({
  chooseWearPhotoSource: jest.fn(),
  pickWearPhoto: jest.fn(),
  saveWearPhoto: jest.fn(),
  removeWearPhoto: jest.fn(),
  deleteWearPhotoFiles: jest.fn(),
  useWearPhotoUrls: jest.fn(),
}));
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
import { chooseWearPhotoSource, pickWearPhoto, saveWearPhoto, useWearPhotoUrls, type WearPhoto } from '@/lib/fits/wearPhoto';
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

/** Today's wears by Fit id, each with id `wear-{fitId}` and the given photo, if any. */
function mockTodayWorn(ids: string[], overrides: Record<string, unknown> = {}, photos: Record<string, WearPhoto> = {}) {
  const wears = new Map(ids.map((id) => [id, { id: `wear-${id}`, photo: photos[id] ?? null }]));
  (useTodayWornFitIds as jest.Mock).mockReturnValue(query({ data: wears, ...overrides }));
}

function mockWearDates(dates: string[], overrides: Record<string, unknown> = {}) {
  (useWearDates as jest.Mock).mockReturnValue(query({ data: new Set(dates), ...overrides }));
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

function homeTree() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );
}

async function renderHome() {
  const result = await render(homeTree());
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
    (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: {} });
    (chooseWearPhotoSource as jest.Mock).mockResolvedValue('library');
    (pickWearPhoto as jest.Mock).mockResolvedValue({ uri: 'file://picked.jpg' });
    (saveWearPhoto as jest.Mock).mockResolvedValue(undefined);
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
      for (const key of ['wornFitIds', 'todayWornFitIds', 'fitWearsRange', 'wearDates', 'fitWearPhotos']) {
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

      expect(screen.getByText('Change Fit')).toBeTruthy();
      expect(screen.getAllByText('Wednesday, Sep 24').length).toBeGreaterThan(1);
      expect(button('Sunday Market').props.accessibilityState).toMatchObject({ selected: true });
      await user.press(button('Office Day'));

      await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
      expect(planFit).toHaveBeenCalledWith('user-1', WED, 'fit-b');
      expect(trackFitPlanned).toHaveBeenCalledWith(0);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plannedFits', 'user-1'] });
    });
  });

  describe("today's wear photo", () => {
    const PHOTO: WearPhoto = {
      path: 'user-1/wear-fit-a/p.webp',
      thumbPath: 'user-1/wear-fit-a/p_thumb.webp',
      thumbhash: 'hash-a',
    };
    const PHOTO_PAGE = 'Your photo from today, 1 of 2. Open to replace or remove';
    const FIT_PAGE = 'Open Sunday Market, 2 of 2';

    function wornToday(photo?: WearPhoto) {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-a'], {}, photo ? { 'fit-a': photo } : {});
    }

    function mockConfirm(buttonIndex: number) {
      return jest
        .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
        .mockImplementation((_options, callback) => callback(buttonIndex));
    }

    // Only the native spies are put back; the module mocks keep the outer beforeEach's defaults.
    afterEach(() => {
      for (const fn of [ActionSheetIOS.showActionSheetWithOptions, Alert.alert]) {
        (fn as unknown as Partial<jest.SpyInstance>).mockRestore?.();
      }
    });

    it('offers no photo before the Fit is worn', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);

      await renderHome();

      expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull();
    });

    it("adds a photo to today's wear from the camera or library, then refreshes the wear reads", async () => {
      wornToday();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      await waitFor(() =>
        expect(saveWearPhoto).toHaveBeenCalledWith('user-1', { id: 'wear-fit-a', photo: null }, 'file://picked.jpg'),
      );
      expect(pickWearPhoto).toHaveBeenCalledWith('library');
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fitWearsRange', 'user-1'] }));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['todayWornFitIds', 'user-1'] });
    });

    it('shows it is saving and ignores another tap until the save lands', async () => {
      wornToday();
      const settle = pendingWrite(saveWearPhoto);
      const { user } = await renderHome();

      await user.press(button('Add a photo'));
      await waitFor(() => expect(saveWearPhoto).toHaveBeenCalledTimes(1));
      expect(button('Add a photo').props.accessibilityState).toMatchObject({ busy: true });
      await user.press(button('Add a photo'));

      expect(chooseWearPhotoSource).toHaveBeenCalledTimes(1);
      await settle();
    });

    it('changes nothing when the picker is cancelled', async () => {
      wornToday();
      (pickWearPhoto as jest.Mock).mockResolvedValue({ cancelled: true });
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      await waitFor(() => expect(pickWearPhoto).toHaveBeenCalled());
      expect(saveWearPhoto).not.toHaveBeenCalled();
    });

    it('changes nothing when the source sheet is cancelled', async () => {
      wornToday();
      (chooseWearPhotoSource as jest.Mock).mockResolvedValue(null);
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      await waitFor(() => expect(chooseWearPhotoSource).toHaveBeenCalled());
      expect(pickWearPhoto).not.toHaveBeenCalled();
      expect(saveWearPhoto).not.toHaveBeenCalled();
    });

    it('explains how to turn access back on in Settings when it was denied', async () => {
      wornToday();
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (chooseWearPhotoSource as jest.Mock).mockResolvedValue('camera');
      (pickWearPhoto as jest.Mock).mockResolvedValue({ denied: true });
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'Camera access is off',
          expect.stringContaining('Settings'),
          expect.arrayContaining([expect.objectContaining({ text: 'Open Settings' })]),
        ),
      );
      expect(saveWearPhoto).not.toHaveBeenCalled();
    });

    it('shows the no-connection notice, unreported, when the save fails offline', async () => {
      wornToday();
      (saveWearPhoto as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
      expect(button('Add a photo')).toBeTruthy();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('shows the unknown-error notice and reports any other save failure', async () => {
      wornToday();
      (saveWearPhoto as jest.Mock).mockRejectedValue(new Error('boom'));
      const { user } = await renderHome();

      await user.press(button('Add a photo'));

      expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it("gives today's sheet the photo section for a Fit worn with nothing planned", async () => {
      mockPlans([]);
      mockTodayWorn(['fit-a']);
      const { user } = await renderHome();

      await user.press(button("Plan today's Fit"));

      expect(within(screen.getByTestId('day-fit-header')).getByText('Worn')).toBeTruthy();
      expect(button('Add a photo of what you wore')).toBeTruthy();
    });

    it("gives today's sheet no photo section when a different Fit than the plan was worn", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-b']);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));

      expect(screen.getByText('Change Fit')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
    });

    it('undoes a wear without a photo in one tap', async () => {
      wornToday();
      const confirm = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      await waitFor(() => expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a'));
      expect(confirm).not.toHaveBeenCalled();
    });

    it('asks before undoing a wear that has a photo, and undoes on confirm', async () => {
      wornToday(PHOTO);
      const confirm = mockConfirm(0);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

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
      wornToday(PHOTO);
      mockConfirm(1);
      const { user } = await renderHome();

      await user.press(button('Worn today. Tap to undo'));

      expect(unmarkFitWornToday).not.toHaveBeenCalled();
      expect(button('Worn today. Tap to undo')).toBeTruthy();
      expect(button(PHOTO_PAGE)).toBeTruthy();
    });

    describe('tile pager (Story 5.7)', () => {
      const PAGE_WIDTH = 343;

      function pager() {
        return screen.getByTestId('home-tile-pager');
      }

      /** Signs every path to `https://signed/{path}`. */
      function mockSignedUrls() {
        (useWearPhotoUrls as jest.Mock).mockImplementation((paths: string[]) => ({
          data: Object.fromEntries(paths.map((path) => [path, `https://signed/${path}`])),
        }));
      }

      /** Lays the pager out, then ends a swipe's momentum on `page`. */
      async function swipeTo(page: number) {
        await fireEvent(pager(), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: PAGE_WIDTH, height: (PAGE_WIDTH * 4) / 3 } },
        });
        await fireEvent(pager(), 'momentumScrollEnd', {
          nativeEvent: {
            contentOffset: { x: PAGE_WIDTH * page, y: 0 },
            layoutMeasurement: { width: PAGE_WIDTH, height: (PAGE_WIDTH * 4) / 3 },
          },
        });
      }

      /**
       * React Native's test ScrollView puts `scrollTo` on its prototype as one
       * shared `jest.fn`; the pager's calls are the ones made on its instance.
       */
      function pagerScrollTos() {
        const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
        return scrollTo.mock.calls.filter(
          (_call, index) => (scrollTo.mock.contexts[index] as { props?: { testID?: string } })?.props?.testID === 'home-tile-pager',
        );
      }

      function clearScrollTos() {
        (ScrollView.prototype.scrollTo as unknown as jest.Mock).mockClear();
      }

      function expectScrolledBackToPhoto() {
        expect(pagerScrollTos()).toEqual([[{ x: 0, y: 0, animated: false }]]);
      }

      function isFilled(marker: number) {
        return /(^| )bg-ink-primary( |$)/.test(screen.getByTestId(`home-tile-marker-${marker}`).props.className);
      }

      /** The one filled marker, checking the other is outlined in secondary ink. */
      function activeMarker() {
        const active = [0, 1].filter(isFilled);
        expect(active).toHaveLength(1);
        const other = screen.getByTestId(`home-tile-marker-${1 - active[0]}`);
        expect(other.props.className).toMatch(/(^| )border-ink-secondary( |$)/);
        return active[0];
      }

      function expectNoPager() {
        expect(screen.queryByTestId('home-tile-pager')).toBeNull();
        expect(screen.queryByTestId('home-tile-marker-0')).toBeNull();
        expect(screen.queryByTestId('home-tile-marker-1')).toBeNull();
        expect(screen.queryByRole('button', { name: PHOTO_PAGE })).toBeNull();
      }

      beforeEach(() => mockSignedUrls());

      it('leads the tile with the full-size photo, then the collage, with the first marker filled and no photo row', async () => {
        wornToday(PHOTO);

        await renderHome();

        const pages = within(pager()).getAllByRole('button');
        expect(pages.map((page) => page.props.accessibilityLabel)).toEqual([PHOTO_PAGE, FIT_PAGE]);
        expect(screen.getByTestId('home-tile-page-photo')).toBe(button(PHOTO_PAGE));
        expect(screen.getByTestId('home-tile-page-fit')).toBe(button(FIT_PAGE));
        expect(StyleSheet.flatten(button(FIT_PAGE).props.style)).toMatchObject({ backgroundColor: '#DCE8DC' });

        // The full photo, not the 240px thumbnail, cached by its path.
        expect(useWearPhotoUrls).toHaveBeenCalledWith([PHOTO.path]);
        expect(useWearPhotoUrls).not.toHaveBeenCalledWith([PHOTO.thumbPath]);
        const photo = within(button(PHOTO_PAGE)).getByTestId('home-wear-photo');
        expect(imageProp(photo, 'source')).toEqual({ uri: `https://signed/${PHOTO.path}`, cacheKey: PHOTO.path });
        expect(imageProp(photo, 'placeholder')).toEqual({ uri: thumbhashUri('hash-a') });
        expect(photo.props.cachePolicy).toBe('memory-disk');

        expect(activeMarker()).toBe(0);
        // Nothing on the tile but the two pages: no labels, captions or badges.
        expect(within(pager()).queryByText(/.+/)).toBeNull();
        expect(screen.queryByText("Today's photo")).toBeNull();
        expect(screen.queryByRole('button', { name: /^Today's photo/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Open Sunday Market' })).toBeNull();
      });

      it('fills the second marker once swiped to the collage, and the first again on the way back', async () => {
        wornToday(PHOTO);
        await renderHome();

        await swipeTo(1);
        expect(activeMarker()).toBe(1);
        // Each page is sized from the pager's measured width, at 3:4.
        expect(StyleSheet.flatten(button(PHOTO_PAGE).props.style)).toMatchObject({
          width: PAGE_WIDTH,
          height: (PAGE_WIDTH * 4) / 3,
        });
        expect(StyleSheet.flatten(screen.getByTestId('home-tile-collage-frame').props.style)).toMatchObject({
          width: PAGE_WIDTH,
        });

        await swipeTo(0);
        expect(activeMarker()).toBe(0);
      });

      it("opens today's day sheet from the photo page", async () => {
        wornToday(PHOTO);
        const { user } = await renderHome();

        await user.press(button(PHOTO_PAGE));

        expect(within(screen.getByTestId('day-fit-header')).getByText('Sunday Market')).toBeTruthy();
        expect(button('Replace photo')).toBeTruthy();
        expect(button('Remove photo')).toBeTruthy();
        expect(router.push).not.toHaveBeenCalled();
      });

      it('opens Fit detail from the collage page', async () => {
        wornToday(PHOTO);
        const { user } = await renderHome();

        await swipeTo(1);
        await user.press(button(FIT_PAGE));

        expect(router.push).toHaveBeenCalledWith('/fit/fit-a');
        expect(screen.queryByTestId('day-fit-header')).toBeNull();
      });

      it('opens on the photo again when Home regains focus', async () => {
        wornToday(PHOTO);
        await renderHome();
        await swipeTo(1);
        expect(activeMarker()).toBe(1);
        clearScrollTos();

        await focus();

        expect(activeMarker()).toBe(0);
        expectScrolledBackToPhoto();
        expect(button(PHOTO_PAGE)).toBeTruthy();
      });

      it('stays on the collage through an inactive spell, and opens on the photo after the background', async () => {
        wornToday(PHOTO);
        await renderHome();
        const onChange = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1] as (state: string) => void;
        await swipeTo(1);
        clearScrollTos();

        // Control Center or a system prompt: inactive, then active again.
        await act(async () => onChange('inactive'));
        await act(async () => onChange('active'));
        expect(activeMarker()).toBe(1);
        expect(pagerScrollTos()).toEqual([]);

        await act(async () => onChange('background'));
        await act(async () => onChange('active'));
        expect(activeMarker()).toBe(0);
        expectScrolledBackToPhoto();
      });

      it('opens on the photo again when the photo changes', async () => {
        wornToday(PHOTO);
        const { rerender } = await renderHome();
        await swipeTo(1);
        clearScrollTos();

        const replaced: WearPhoto = {
          path: 'user-1/wear-fit-a/q.webp',
          thumbPath: 'user-1/wear-fit-a/q_thumb.webp',
          thumbhash: 'hash-q',
        };
        mockTodayWorn(['fit-a'], {}, { 'fit-a': replaced });
        await rerender(homeTree());

        expect(activeMarker()).toBe(0);
        expectScrolledBackToPhoto();
        const photo = within(button(PHOTO_PAGE)).getByTestId('home-wear-photo');
        expect(imageProp(photo, 'source')).toEqual({ uri: `https://signed/${replaced.path}`, cacheKey: replaced.path });
      });

      it('shows the collage alone, with no markers, and Add a photo when the wear has no photo', async () => {
        wornToday();

        await renderHome();

        expectNoPager();
        expect(button('Open Sunday Market')).toBeTruthy();
        expect(button('Add a photo')).toBeTruthy();
      });

      it('shows the collage alone, with no markers or Add a photo, before the Fit is worn', async () => {
        mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);

        await renderHome();

        expectNoPager();
        expect(button('Open Sunday Market')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull();
      });

      it('turns the tile into the pager, on the photo, once Add a photo saves', async () => {
        wornToday();
        const { user, rerender } = await renderHome();

        await user.press(button('Add a photo'));
        await waitFor(() => expect(saveWearPhoto).toHaveBeenCalled());
        mockTodayWorn(['fit-a'], {}, { 'fit-a': PHOTO });
        await rerender(homeTree());

        expect(await screen.findByTestId('home-tile-pager')).toBeTruthy();
        expect(button(PHOTO_PAGE)).toBeTruthy();
        expect(activeMarker()).toBe(0);
        expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull();
      });

      it('collapses to the collage at once when a wear with a photo is undone', async () => {
        wornToday(PHOTO);
        mockConfirm(0);
        const settle = pendingWrite(unmarkFitWornToday);
        const { user } = await renderHome();

        await user.press(button('Worn today. Tap to undo'));

        expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');
        expectNoPager();
        expect(button('Open Sunday Market')).toBeTruthy();
        await settle();
      });

      it('brings the pager back when the undo fails', async () => {
        wornToday(PHOTO);
        mockConfirm(0);
        (unmarkFitWornToday as jest.Mock).mockRejectedValue(new Error('boom'));
        const { user } = await renderHome();

        await user.press(button('Worn today. Tap to undo'));

        expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
        expect(button(PHOTO_PAGE)).toBeTruthy();
        expect(button(FIT_PAGE)).toBeTruthy();
        expect(activeMarker()).toBe(0);
      });

      it("shows the thumbhash on the photo page while the full photo's URL is signed", async () => {
        wornToday(PHOTO);
        (useWearPhotoUrls as jest.Mock).mockReturnValue({ data: {} });

        await renderHome();

        const photo = within(button(PHOTO_PAGE)).getByTestId('home-wear-photo');
        expect(imageProp(photo, 'source')?.uri).toBeUndefined();
        expect(imageProp(photo, 'placeholder')).toEqual({ uri: thumbhashUri('hash-a') });
      });
    });
  });

  describe("today's sheet header (Story 5.6)", () => {
    function header() {
      return screen.getByTestId('day-fit-header');
    }

    function headerButton(name: string) {
      return within(header()).getByRole('button', { name });
    }

    it("leads Change today's Fit with the same header as the Planner, Mark worn included", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 3]]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));

      expect(within(header()).getByText('Sunday Market')).toBeTruthy();
      expect(within(header()).getByText('Planned for today · Worn 3×')).toBeTruthy();
      expect(within(header()).getByTestId('day-fit-header-collage')).toBeTruthy();
      expect(headerButton('View Fit')).toBeTruthy();
      expect(headerButton('Mark worn')).toBeTruthy();
      expect(screen.getByText('Change Fit')).toBeTruthy();
    });

    it("shares one toggle with the card: marking worn in the sheet flips both, tracked as home", async () => {
      const settle = pendingWrite(markFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 3]]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      await user.press(headerButton('Mark worn'));

      expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
      expect(within(header()).getByText('Worn 4× · including today')).toBeTruthy();
      // The card behind the sheet shows the same state.
      expect(screen.getAllByRole('button', { name: 'Worn today. Tap to undo' })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Mark worn' })).toBeNull();
      expect(markFitWornToday).toHaveBeenCalledTimes(1);
      expect(markFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');

      await settle();
      await waitFor(() => expect(trackFitWorn).toHaveBeenCalledWith('home'));
    });

    it("opens on the card's worn state and drops the collage beside the photo section", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockWearCounts([['fit-a', 5]]);
      mockTodayWorn(['fit-a']);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));

      expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
      expect(within(header()).getByText('Worn 5× · including today')).toBeTruthy();
      expect(within(header()).queryByTestId('day-fit-header-collage')).toBeNull();
      expect(button('Add a photo of what you wore')).toBeTruthy();
    });

    it('undoes from the sheet and the card follows', async () => {
      const settle = pendingWrite(unmarkFitWornToday);
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      mockTodayWorn(['fit-a']);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      expect(button('Add a photo of what you wore')).toBeTruthy();
      await user.press(headerButton('Worn today. Tap to undo'));

      expect(screen.getAllByRole('button', { name: 'Mark worn' })).toHaveLength(2);
      // The photo section goes at once, before the unmark lands.
      expect(screen.queryByRole('button', { name: 'Add a photo of what you wore' })).toBeNull();
      expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-a');
      await settle();
    });

    it('shows a wear error in the sheet', async () => {
      (markFitWornToday as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      await user.press(headerButton('Mark worn'));

      // Once on the card behind, once in the sheet.
      expect(await screen.findAllByText(NO_CONNECTION_MESSAGE)).toHaveLength(2);
      expect(headerButton('Mark worn')).toBeTruthy();
    });

    it('leads with the worn Fit when today was worn with nothing planned, reading plain "Worn"', async () => {
      mockTodayWorn(['fit-a']);
      mockWearCounts([['fit-a', 4]]);
      const { user } = await renderHome();

      await user.press(button("Plan today's Fit"));

      expect(within(header()).getByText('Sunday Market')).toBeTruthy();
      expect(within(header()).getByText('Worn')).toBeTruthy();
      expect(within(header()).queryByText(/Worn 4×/)).toBeNull();
      expect(headerButton('Worn today. Tap to undo')).toBeTruthy();
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
      expect(screen.queryByTestId(/^plan-sheet-check-/)).toBeNull();
      expect(screen.queryByText('Remove from Wednesday')).toBeNull();
    });

    it("keys the toggle to the Fit worn today when nothing is planned, so the sheet's undo acts on it", async () => {
      const settle = pendingWrite(unmarkFitWornToday);
      mockTodayWorn(['fit-b']);
      mockWearDates([TUE, WED]);
      const { user } = await renderHome();

      await user.press(button("Plan today's Fit"));
      expect(within(header()).getByText('Office Day')).toBeTruthy();
      await user.press(headerButton('Worn today. Tap to undo'));

      expect(unmarkFitWornToday).toHaveBeenCalledWith('user-1', 'fit-b');
      expect(headerButton('Mark worn')).toBeTruthy();
      // The streak follows the same optimistic undo.
      expect(screen.getByText('1 day')).toBeTruthy();
      await settle();
    });

    it('opens on the grid alone when nothing is planned or worn', async () => {
      const { user } = await renderHome();

      await user.press(button("Plan today's Fit"));

      expect(screen.queryByTestId('day-fit-header')).toBeNull();
      expect(screen.getByText('Choose a Fit')).toBeTruthy();
    });

    it('View Fit closes the sheet and opens Fit detail', async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      await user.press(headerButton('View Fit'));

      expect(screen.queryByTestId('day-fit-header')).toBeNull();
      expect(router.push).toHaveBeenCalledWith('/fit/fit-a');
    });
  });

  describe('removing today', () => {
    it("removes today's Fit from the day sheet", async () => {
      mockPlans([{ planned_on: WED, fit_id: 'fit-a' }]);
      const { user } = await renderHome();

      await user.press(button("Change today's Fit"));
      await user.press(button('Remove from Wednesday'));

      await waitFor(() => expect(screen.queryByText('Change Fit')).toBeNull());
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
