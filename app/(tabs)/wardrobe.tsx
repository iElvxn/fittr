import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { CategoryFilterChips, type CategoryFilter } from '@/components/wardrobe/CategoryFilterChips';
import { WardrobeGridCell } from '@/components/wardrobe/WardrobeGridCell';
import { WardrobeGridSkeleton } from '@/components/wardrobe/WardrobeGridSkeleton';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, filterByCategory } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/wardrobe/errors';
import { Sentry } from '@/lib/observability/sentry';

const ACK_DURATION_MS = 2500;
const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const GUTTER = 16;

export default function Wardrobe() {
  const { itemAdded } = useLocalSearchParams<{ itemAdded?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // the param itself is the source of truth for whether the ack is showing.
  const showAck = itemAdded === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    // After the ack window, clear the param so it doesn't re-trigger on a
    // later re-render or re-focus of this tab (e.g. switching tabs and back).
    const timeout = setTimeout(() => router.setParams({ itemAdded: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck]);

  const { session } = useSession();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  const { data: items, isLoading, isError, error, refetch, isRefetching } = useWardrobeItems(userId);

  // `router.dismissTo` (used when Save succeeds in add-item.tsx) returns to
  // this already-mounted tab rather than remounting it, so TanStack Query's
  // mount-time refetch never fires on its own -- without this, the "Item
  // added." ack can show while the grid still reflects the pre-save state.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  useEffect(() => {
    if (isError && !isNoConnectionError(error)) {
      // Everything expected (no connection) is already distinguishable via
      // `isNoConnectionError`; anything else here is worth seeing rather
      // than silently collapsing into the generic message.
      Sentry.captureException(error);
    }
  }, [isError, error]);

  // Computed from the full unfiltered list, not `visibleItems` -- a filter
  // chip tap must not trigger a new signed-URL fetch for images already on
  // screen.
  const thumbPaths = useMemo(() => (items ?? []).map((item) => item.thumb_path), [items]);
  const {
    data: thumbnailUrls,
    isError: isThumbnailError,
    error: thumbnailError,
  } = useThumbnailUrls(thumbPaths);

  useEffect(() => {
    if (isThumbnailError) {
      // No user-facing retry for this one -- a broken bulk signed-URL
      // request already degrades gracefully to per-cell placeholders, but
      // that degradation was otherwise invisible to anyone but the user.
      Sentry.captureException(thumbnailError);
    }
  }, [isThumbnailError, thumbnailError]);

  const visibleItems = useMemo(() => filterByCategory(items ?? [], selectedCategory), [items, selectedCategory]);
  const cellSize = (width - GUTTER * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  const header = (
    <View
      style={{ paddingTop: insets.top + 12 }}
      className="border-b border-border-hairline px-gutter pb-4 dark:border-border-hairlineDark"
    >
      {showAck ? (
        <Text
          accessibilityRole="alert"
          variant="body"
          className="mb-4 text-ink-primary dark:text-ink-primaryDark"
        >
          Item added.
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          Wardrobe
        </Text>
        <Button title="Add item" variant="primary" onPress={() => router.push('/add-item')} />
      </View>
    </View>
  );

  if (!userId || isLoading) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <WardrobeGridSkeleton columns={GRID_COLUMNS} cellSize={cellSize} gap={GRID_GAP} />
      </View>
    );
  }

  if (isError) {
    const message = isNoConnectionError(error) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="px-gutter">
          <View className="mb-6">
            <ConnectionErrorNotice message={message} />
          </View>
          <Button title="Retry" variant="primary" onPress={() => refetch()} />
        </View>
      </View>
    );
  }

  if ((items ?? []).length === 0) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            Add your first item.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      <Text variant="meta" className="mb-3 px-gutter text-ink-secondary dark:text-ink-secondaryDark">
        {items!.length} {items!.length === 1 ? 'item' : 'items'}
      </Text>
      <View className="mb-3">
        <CategoryFilterChips selected={selectedCategory} onSelect={setSelectedCategory} />
      </View>
      {visibleItems.length === 0 ? (
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            No items in this category.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="wardrobe-grid"
          data={visibleItems}
          key={GRID_COLUMNS}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-gutter pb-6"
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          renderItem={({ item }) => (
            <WardrobeGridCell
              category={item.category}
              name={item.name}
              thumbnailUrl={thumbnailUrls?.[item.thumb_path] ?? null}
              size={cellSize}
            />
          )}
        />
      )}
    </View>
  );
}
