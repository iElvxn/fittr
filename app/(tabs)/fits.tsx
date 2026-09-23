import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  type Href,
  type NativeStackNavigationProp,
} from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CirclePlusButton } from '@/components/ui/CirclePlusButton';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { FitsGridCell } from '@/components/fits/FitsGridCell';
import { FitsGridSkeleton } from '@/components/fits/FitsGridSkeleton';
import { FitsFilterChips, type FitsFilter } from '@/components/fits/FitsFilterChips';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { useWornFitIds } from '@/lib/fits/wornFitIds';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { Sentry } from '@/lib/observability/sentry';

const FILTER_EMPTY_COPY: Record<Exclude<FitsFilter, 'all'>, string> = {
  favorites: 'No Favorites yet.',
  worn: 'Nothing worn yet.',
};

const ACK_DURATION_MS = 2500;
const GRID_COLUMNS = 2;
const GRID_GAP = 8;
const GUTTER = 16;

export default function Fits() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const userId = session?.user.id;

  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { fitSaved } = useLocalSearchParams<{ fitSaved?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // same convention as `wardrobe.tsx`'s `itemAdded` ack.
  const showAck = fitSaved === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    // Scoped to this screen's own route via `useNavigation()`, not the
    // global `router.setParams` -- that one targets whichever screen is
    // currently focused, so if the user taps into a Fit's detail screen
    // before this timeout fires, it would clear the wrong screen's params
    // and leave "Fit saved." stuck here indefinitely.
    const timeout = setTimeout(() => navigation.setParams({ fitSaved: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck, navigation]);

  const { data: fits, isLoading, isError, error, refetch } = useFits(userId);
  const { data: wornFitIds, isLoading: isWornLoading, isError: isWornError, error: wornError } = useWornFitIds(userId);
  const [filter, setFilter] = useState<FitsFilter>('all');

  // Same reasoning as `wardrobe.tsx`'s own `useFocusEffect`: `router.dismissTo`
  // (used on a successful save/edit in `new-fit.tsx`) returns to this
  // already-mounted tab rather than remounting it, so a mount-time refetch
  // never fires on its own.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  useEffect(() => {
    if (isError && !isNoConnectionError(error)) {
      Sentry.captureException(error);
    }
  }, [isError, error]);

  // Fails open, same as `fit/[id].tsx`'s item-count read: a failed secondary
  // read (Worn status) shouldn't block viewing/filtering an otherwise
  // healthy Fits list -- it just means the Worn filter under-counts until
  // this self-heals on the next focus-triggered refetch. `getWornFitIds`
  // throws its own classified `FitError` (unlike `useFits`'s queryFn, which
  // lets the raw Supabase error through), so this checks `instanceof
  // FitError` rather than the generic `isNoConnectionError`, same as
  // `fit/[id].tsx`'s own `isItemsNoConnection` check.
  const isWornNoConnection = wornError instanceof FitError && wornError.kind === 'no_connection';
  useEffect(() => {
    if (isWornError && !isWornNoConnection) {
      Sentry.captureException(wornError);
    }
  }, [isWornError, isWornNoConnection, wornError]);

  const coverPaths = useMemo(() => (fits ?? []).map((fit) => fit.cover_path).filter((path): path is string => Boolean(path)), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);
  const columnWidth = (width - GUTTER * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  // Client-side filtering -- Favorites/Worn are both correctly empty until
  // Story 4.2 lands the toggle/mark-worn write paths (`is_favorite` and
  // `fit_wears` both already exist ahead of their own write UI, same
  // precedent as `0004_fits.sql`'s own `is_favorite` column comment).
  const filteredFits = useMemo(() => {
    const allFits = fits ?? [];
    if (filter === 'favorites') {
      return allFits.filter((candidate) => candidate.is_favorite);
    }
    if (filter === 'worn') {
      return allFits.filter((candidate) => wornFitIds?.has(candidate.id) ?? false);
    }
    return allFits;
  }, [fits, filter, wornFitIds]);

  const header = (
    <View
      style={{ paddingTop: insets.top + 8 }}
      className="border-b border-border-hairline px-gutter pb-2 dark:border-border-hairlineDark"
    >
      {showAck ? (
        <Text accessibilityRole="alert" variant="body" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
          Fit saved.
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          My Fits
        </Text>
        <CirclePlusButton accessibilityLabel="New Fit" onPress={() => router.push('/new-fit')} />
      </View>
    </View>
  );

  if (!userId || isLoading || isWornLoading) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <FitsGridSkeleton columns={GRID_COLUMNS} columnWidth={columnWidth} gap={GRID_GAP} />
      </View>
    );
  }

  if (isError) {
    const message = isNoConnectionError(error) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="px-gutter pt-6">
          <View className="mb-6">
            <ConnectionErrorNotice message={message} />
          </View>
          <Button title="Retry" variant="primary" onPress={() => refetch()} />
        </View>
      </View>
    );
  }

  if ((fits ?? []).length === 0) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="mb-6 text-center text-ink-secondary dark:text-ink-secondaryDark">
            Build your first Fit.
          </Text>
          <Button title="New Fit" variant="primary" onPress={() => router.push('/new-fit')} />
        </View>
      </View>
    );
  }

  function renderCell({ item }: { item: FitRow }) {
    const thumbnailUrl = item.cover_path ? (thumbnailUrls?.[item.cover_path] ?? null) : null;
    return (
      <FitsGridCell
        name={item.name}
        thumbnailUrl={thumbnailUrl}
        columnWidth={columnWidth}
        onPress={() => router.push({ pathname: '/fit/[id]', params: { id: item.id } } as Href)}
        fitId={item.id}
        isFavorite={item.is_favorite}
        userId={userId}
      />
    );
  }

  const filterEmptyMessage = filter !== 'all' && filteredFits.length === 0 ? FILTER_EMPTY_COPY[filter] : null;

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      <View className="pb-1 pt-3">
        <FitsFilterChips selected={filter} onSelect={setFilter} />
      </View>
      {filterEmptyMessage ? (
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            {filterEmptyMessage}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="fits-grid"
          data={filteredFits}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-gutter pt-3"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP, alignItems: 'flex-start' }}
          renderItem={renderCell}
        />
      )}
    </View>
  );
}
