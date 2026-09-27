import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { PersonIcon } from '@/components/ui/icons/PersonIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { NothingPlannedCard } from '@/components/home/NothingPlannedCard';
import { TodayFitCard } from '@/components/home/TodayFitCard';
import { WearStreakRow } from '@/components/home/WearStreakRow';
import { WeekStrip } from '@/components/home/WeekStrip';
import { PlanDaySheet } from '@/components/planner/PlanDaySheet';
import { colors } from '@/lib/theme/colors';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { useSession } from '@/lib/auth/useSession';
import { useProfile } from '@/lib/profile/useProfile';
import { useAvatarUrl } from '@/lib/profile/avatarUrl';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { todayLocalDate } from '@/lib/fits/localDate';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useFitWearCounts, useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { useWearDates, wearStreak } from '@/lib/fits/wearStreak';
import { usePlannedFits } from '@/lib/planner/plannedFits';
import { usePlanDayWrites } from '@/lib/planner/usePlanDayWrites';
import { weekDays, weekStartOf } from '@/lib/planner/week';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useWearPhotoUrls } from '@/lib/fits/wearPhoto';
import { useWearPhotoActions } from '@/lib/fits/useWearPhotoActions';
import { useWornTodayToggle } from '@/lib/fits/useWornTodayToggle';
import { todayPlannedStatus } from '@/lib/fits/wearStatus';
import type { WearRef } from '@/lib/fits/wearRef';
import { Sentry } from '@/lib/observability/sentry';

const PROFILE_TOUCH_TARGET = 48;
const AVATAR_SIZE = 38;

/**
 * Home (Stories 5.2 + 4.4): today's planned Fit with one-tap Mark worn, the
 * wear streak and a glance at the week.
 *
 * Profile lives here as a top-right icon rather than its own tab (see
 * `(tabs)/_layout.tsx`) -- a top-level pushed route, not a tab destination.
 * Shows the user's actual avatar when they have one (same query/cache as
 * the Profile screen itself, via `useProfile`), falling back to a plain
 * person icon otherwise.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const { data: avatarUrl } = useAvatarUrl(profile?.avatar_path);

  // Same as the Planner: tabs stay mounted and a backgrounded app can resume
  // on a later day, so "today" is re-read on focus and on returning to the
  // foreground rather than fixed at mount.
  const [today, setToday] = useState(todayLocalDate);
  // Story 5.7: bumped each time Home comes back into view -- a tab focus, or
  // a return from the background -- so the big tile opens on today's photo
  // again. Not bumped by `refresh()` alone: an inactive -> active change
  // (Control Center, a Face ID prompt) leaves the page where the user left it.
  const [focusCount, setFocusCount] = useState(0);
  const weekStart = weekStartOf(today);
  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);
  const todayDay = days.find((day) => day.isToday) ?? days[0];

  const fitsQuery = useFits(userId);
  const plansQuery = usePlannedFits(userId, weekStart);
  const countsQuery = useFitWearCounts(userId);
  const todayWornQuery = useTodayWornFitIds(userId);
  const wearDatesQuery = useWearDates(userId);

  // Tabs stay mounted, so a plan made in the Planner or a wear from Fit
  // detail only shows up if every read refetches when the tab regains focus.
  // Resuming from the background refetches too: today's worn set is cached
  // under a key with no date, so after resuming on a later day it would
  // otherwise still describe yesterday -- and a tap on its stale "Worn
  // today" would undo a wear that doesn't exist.
  function refresh() {
    setToday(todayLocalDate());
    fitsQuery.refetch();
    plansQuery.refetch();
    countsQuery.refetch();
    todayWornQuery.refetch();
    wearDatesQuery.refetch();
  }
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useFocusEffect(
    useCallback(() => {
      setFocusCount((count) => count + 1);
      refreshRef.current();
    }, []),
  );
  useEffect(() => {
    // Whether the app went to the background since it was last active.
    let backgrounded = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgrounded = true;
      } else if (state === 'active') {
        if (backgrounded) {
          backgrounded = false;
          setFocusCount((count) => count + 1);
        }
        refreshRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  const fitsError = fitsQuery.isError ? fitsQuery.error : null;
  const plansError = plansQuery.isError ? plansQuery.error : null;
  // The wear reads fail open -- no count, no streak row, or "not worn yet" --
  // never a blocked Home. They're still reported.
  const countsError = countsQuery.isError ? countsQuery.error : null;
  const todayWornError = todayWornQuery.isError ? todayWornQuery.error : null;
  const wearDatesError = wearDatesQuery.isError ? wearDatesQuery.error : null;
  useEffect(() => {
    for (const error of [fitsError, plansError, countsError, todayWornError, wearDatesError]) {
      if (error && !isOffline(error)) {
        Sentry.captureException(error);
      }
    }
  }, [fitsError, plansError, countsError, todayWornError, wearDatesError]);
  // Same rule as the Planner: only a read with nothing to show replaces Home.
  const readError = fitsError && !fitsQuery.data ? fitsError : plansError && !plansQuery.data ? plansError : null;

  const fits = useMemo(() => fitsQuery.data ?? [], [fitsQuery.data]);
  // Joined against the live Fits list, so a plan whose Fit was deleted reads as nothing planned.
  const planByDate = useMemo(() => {
    const fitsById = new Map(fits.map((fit) => [fit.id, fit]));
    const map = new Map<string, FitRow>();
    for (const plan of plansQuery.data ?? []) {
      const fit = fitsById.get(plan.fit_id);
      if (fit) {
        map.set(plan.planned_on, fit);
      }
    }
    return map;
  }, [plansQuery.data, fits]);
  const todayFit = planByDate.get(today) ?? null;

  const coverPaths = useMemo(() => fits.flatMap((fit) => (fit.cover_path ? [fit.cover_path] : [])), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  const { sheetDate, sheetFit, busy, writeError, openDay, closeSheet, pickFit, removeFit } = usePlanDayWrites({
    userId,
    today,
    planByDate,
  });
  const sheetDay = days.find((day) => day.date === sheetDate) ?? null;
  // The Fit today's toggle acts on, shared by the card and the sheet (Story
  // 5.6): the planned one, else the first live Fit worn today, as in the
  // Planner. Home's sheet is only ever today's, so it leads with this Fit too.
  const toggleFit = todayFit ?? fits.find((fit) => todayWornQuery.data?.has(fit.id)) ?? null;
  // Story 5.4: today's wear as the server has it (not the optimistic flip),
  // since only a saved wear can take a photo.
  const todayWear = toggleFit ? (todayWornQuery.data?.get(toggleFit.id) ?? null) : null;
  const photoActions = useWearPhotoActions(userId);
  const {
    isWornToday,
    serverWornToday,
    override,
    busy: wearBusy,
    error: wearError,
    toggle: toggleWornToday,
    isBusy: isWearBusy,
    clearError: clearWearError,
  } = useWornTodayToggle({
    userId,
    fitId: toggleFit?.id ?? null,
    wear: todayWear,
    source: 'home',
    blocked: photoActions.busy || busy,
  });

  const todayPhoto = todayFit && isWornToday ? (todayWear?.photo ?? null) : null;
  // Story 5.7: the photo fills the big tile, so it loads the full-size file, not the thumbnail.
  const { data: todayPhotoUrls } = useWearPhotoUrls(todayPhoto ? [todayPhoto.path] : []);

  // The sheet's worn Fit and its photo section follow the toggle, so an undo
  // takes the section away at once, as it does the card's photo page.
  const sheetWorn: { fit: FitRow; wear: WearRef } | null =
    sheetDate === today && toggleFit && todayWear && isWornToday && (!sheetFit || sheetFit.id === toggleFit.id)
      ? { fit: toggleFit, wear: todayWear }
      : null;

  function openSheet() {
    photoActions.clearError();
    clearWearError();
    openDay(today);
  }

  function closeDaySheet() {
    if (photoActions.busy || isWearBusy()) {
      return;
    }
    photoActions.clearError();
    clearWearError();
    closeSheet();
  }

  function viewFit(fitId: string) {
    if (busy || photoActions.busy || isWearBusy()) {
      return;
    }
    closeDaySheet();
    router.push(`/fit/${fitId}`);
  }

  // The count and streak follow the optimistic toggle, so both move the
  // moment Mark worn is tapped rather than after the refetch.
  const meta = todayFit ? todayPlannedStatus(countsQuery.data, todayFit.id, serverWornToday, isWornToday) : '';
  const sheetHeader =
    sheetDate === today && toggleFit
      ? {
          fit: toggleFit,
          // A Fit worn with nothing planned just reads "Worn".
          status: todayFit ? meta : isWornToday ? 'Worn' : '',
          onViewFit: () => viewFit(toggleFit.id),
          wornToggle: { isWornToday, onToggle: () => void toggleWornToday() },
        }
      : null;

  const wearDates = useMemo(() => {
    if (!wearDatesQuery.data) {
      return null;
    }
    const dates = new Set(wearDatesQuery.data);
    if (override === true) {
      dates.add(today);
    } else if (override === false && toggleFit) {
      // Today stays in the streak if another Fit was also worn today.
      const otherWornToday = [...(todayWornQuery.data?.keys() ?? [])].some((id) => id !== toggleFit.id);
      if (!otherWornToday) {
        dates.delete(today);
      }
    }
    return dates;
  }, [wearDatesQuery.data, override, today, toggleFit, todayWornQuery.data]);
  const streak = wearDates ? wearStreak(wearDates, today) : 0;

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-end justify-between gap-3 px-gutter">
      <View className="shrink gap-1.5">
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          {todayDay.long}
        </Text>
        <Text accessibilityRole="header" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
          Today
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push('/profile')}
        hitSlop={8}
        style={{
          width: PROFILE_TOUCH_TARGET,
          height: PROFILE_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {avatarUrl ? (
          <Image
            accessibilityLabel="Profile avatar"
            source={{ uri: avatarUrl }}
            style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
          />
        ) : (
          <PersonIcon size={26} color={inkPrimary} />
        )}
      </Pressable>
    </View>
  );

  function renderScreen(body: ReactNode) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        {body}
      </View>
    );
  }

  if (
    !userId ||
    fitsQuery.isLoading ||
    plansQuery.isLoading ||
    countsQuery.isLoading ||
    todayWornQuery.isLoading ||
    wearDatesQuery.isLoading
  ) {
    return renderScreen(<HomeSkeleton />);
  }

  if (readError) {
    return renderScreen(
      <View className="px-gutter pt-6">
        <View className="mb-6">
          <ConnectionErrorNotice message={isOffline(readError) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE} />
        </View>
        <Button
          title="Retry"
          variant="primary"
          onPress={() => {
            fitsQuery.refetch();
            plansQuery.refetch();
          }}
        />
      </View>,
    );
  }

  return renderScreen(
    <>
      <ScrollView contentContainerClassName="px-gutter pt-5" contentContainerStyle={{ paddingBottom: tabBarClearance }}>
        {todayFit ? (
          <TodayFitCard
            fit={todayFit}
            coverUrl={todayFit.cover_path ? (thumbnailUrls?.[todayFit.cover_path] ?? null) : null}
            meta={meta}
            isWornToday={isWornToday}
            busy={wearBusy || photoActions.busy}
            errorMessage={wearError ?? (sheetDate ? null : photoActions.error)}
            onOpen={() => router.push(`/fit/${todayFit.id}`)}
            onToggleWorn={() => void toggleWornToday()}
            onChange={() => openSheet()}
            photo={todayPhoto ? { ...todayPhoto, url: todayPhotoUrls?.[todayPhoto.path] ?? null } : null}
            tileResetKey={`${focusCount}|${todayPhoto?.path ?? ''}`}
            canAddPhoto={isWornToday && Boolean(todayWear) && !todayPhoto}
            photoBusy={photoActions.busy || wearBusy}
            photoSaving={Boolean(photoActions.saving)}
            onAddPhoto={() => {
              if (todayWear && !isWearBusy()) {
                photoActions.addPhoto(todayWear);
              }
            }}
            onOpenPhoto={() => openSheet()}
          />
        ) : (
          <NothingPlannedCard
            hasFits={fits.length > 0}
            onPlan={() => openSheet()}
            onBuild={() => router.push('/new-fit')}
          />
        )}

        {streak > 0 ? (
          <View className="pt-8">
            <WearStreakRow days={streak} includesToday={wearDates?.has(today) ?? false} />
          </View>
        ) : null}

        <View className="pt-8">
          <WeekStrip
            days={days}
            planByDate={planByDate}
            thumbnailUrls={thumbnailUrls}
            onOpenPlanner={() => router.navigate('/planner')}
          />
        </View>
      </ScrollView>
      <PlanDaySheet
        day={sheetDay}
        fits={fits}
        selectedFitId={sheetFit?.id ?? null}
        thumbnailUrls={thumbnailUrls}
        busy={busy || photoActions.busy || wearBusy}
        errorMessage={writeError ?? wearError ?? photoActions.error}
        onPick={pickFit}
        onRemove={removeFit}
        onClose={closeDaySheet}
        worn={sheetWorn}
        photoSavingUri={
          sheetWorn && photoActions.saving?.wearId === sheetWorn.wear.id ? photoActions.saving.uri : null
        }
        onAddPhoto={photoActions.addPhoto}
        onRemovePhoto={photoActions.removePhoto}
        header={sheetHeader}
      />
    </>,
  );
}
