import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { cacheBustedCoverUrl } from '@/lib/fits/coverCacheBust';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { Sentry } from '@/lib/observability/sentry';

const ACK_DURATION_MS = 2500;
const ROW_THUMB_SIZE = 56;

/**
 * A minimal, deliberate stopgap for Story 3.3: hairline-separated rows
 * (thumbnail + name, no card chrome, no filter/sort), just enough for a real
 * user to reach a saved Fit's detail screen to edit or delete it. Epic 4
 * replaces this with the real My Fits grid.
 */
export default function Fits() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { session } = useSession();
  const userId = session?.user.id;

  const { fitSaved } = useLocalSearchParams<{ fitSaved?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // same convention as `wardrobe.tsx`'s `itemAdded` ack.
  const showAck = fitSaved === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    const timeout = setTimeout(() => router.setParams({ fitSaved: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck]);

  const { data: fits, isLoading, isError, error, refetch } = useFits(userId);

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

  const coverPaths = useMemo(() => (fits ?? []).map((fit) => fit.cover_path).filter((path): path is string => Boolean(path)), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  const header = (
    <View
      style={{ paddingTop: insets.top + 12 }}
      className="border-b border-border-hairline px-gutter pb-4 dark:border-border-hairlineDark"
    >
      {showAck ? (
        <Text accessibilityRole="alert" variant="body" className="mb-4 text-ink-primary dark:text-ink-primaryDark">
          Fit saved.
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          My Fits
        </Text>
        <Button title="New Fit" variant="primary" onPress={() => router.push('/new-fit')} />
      </View>
    </View>
  );

  if (!userId || isLoading) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
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

  function renderRow({ item }: { item: FitRow }) {
    const signedThumbnailUrl = item.cover_path ? (thumbnailUrls?.[item.cover_path] ?? null) : null;
    const thumbnailUrl = signedThumbnailUrl ? cacheBustedCoverUrl(signedThumbnailUrl, item.updated_at) : null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={() => router.push({ pathname: '/fit/[id]', params: { id: item.id } } as Href)}
        className="flex-row items-center gap-4 border-b border-border-hairline px-gutter py-3 dark:border-border-hairlineDark"
      >
        <View style={{ width: ROW_THUMB_SIZE, height: ROW_THUMB_SIZE }} className="overflow-hidden rounded-sm">
          {thumbnailUrl ? (
            <Image
              testID="fits-row-thumbnail"
              accessibilityLabel=""
              source={{ uri: thumbnailUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View testID="fits-row-thumbnail-fallback" className="h-full w-full bg-surface-raised dark:bg-surface-raisedDark" />
          )}
        </View>
        <Text variant="body" className="flex-1 text-ink-primary dark:text-ink-primaryDark" numberOfLines={1}>
          {item.name}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      <FlatList
        testID="fits-list"
        data={fits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        renderItem={renderRow}
      />
    </View>
  );
}
