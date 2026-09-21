import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

const ACK_DURATION_MS = 2500;
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const COVER_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

/**
 * Scoped to exactly what Story 3.3 needs -- collage, name, Edit, Delete.
 * Favorite/Wear/Plan/Share (EXPERIENCE.md's full Fit-detail action set)
 * belong to their own later stories and get no placeholders here.
 */
export default function FitDetail() {
  const { id, fitUpdated } = useLocalSearchParams<{ id: string; fitUpdated?: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Same "already-cached list is the single source of truth" convention as
  // `app/item/[id].tsx` -- no separate single-Fit query.
  const { data: fits, isLoading, isError: isListError, error: listError, refetch: refetchFits } = useFits(userId);
  const fit = fits?.find((candidate) => candidate.id === id);

  // Powers the zero-item empty state (Story 3.4) -- `fit` itself carries no
  // item count, only `getFitItems`'s placements do. Never blocking, loading
  // or failed alike: `liveItemCount` stays `null` in both cases and the
  // cover renders as it always has, only swapping to the empty state once
  // this has actually resolved to zero live items. A failed secondary read
  // here shouldn't cost the user the ability to view/edit/delete an
  // otherwise perfectly healthy Fit -- it's reported to Sentry (below) and
  // self-heals on the next mount/refetch rather than blocking the screen.
  const {
    data: fitItems,
    isError: isItemsError,
    error: itemsError,
  } = useQuery({
    queryKey: ['fitItems', fit?.id],
    queryFn: () => getFitItems(fit!.id),
    enabled: Boolean(fit),
  });
  const liveItemCount = fitItems ? fitItems.filter((item) => !item.wardrobeItemDeleted).length : null;
  const isEmptyFit = liveItemCount === 0;
  // `getFitItems` throws its own classified `FitError`, unlike `useFits`'s
  // queryFn (which lets the raw Supabase error through for `isNoConnectionError`
  // above) -- same `instanceof FitError` check `app/new-fit.tsx`'s `loadFit` uses.
  const isItemsNoConnection = itemsError instanceof FitError && itemsError.kind === 'no_connection';

  useEffect(() => {
    if (isItemsError && !isItemsNoConnection) {
      Sentry.captureException(itemsError);
    }
  }, [isItemsError, isItemsNoConnection, itemsError]);

  useEffect(() => {
    if (isListError && !isNoConnectionError(listError)) {
      Sentry.captureException(listError);
    }
  }, [isListError, listError]);

  const showAck = fitUpdated === '1';
  useEffect(() => {
    if (!showAck) {
      return;
    }
    const timeout = setTimeout(() => router.setParams({ fitUpdated: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck]);

  const { data: thumbnailUrls } = useThumbnailUrls(fit?.cover_path ? [fit.cover_path] : []);
  const coverUrl = fit?.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;

  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function reportUnknownError(error: unknown) {
    Sentry.captureException(error);
    setErrorMessage(UNKNOWN_ERROR_MESSAGE);
  }

  async function handleDelete() {
    if (!fit) {
      return;
    }
    setErrorMessage(null);
    setDeleting(true);
    try {
      await deleteFit(fit.id);
      // Not awaited: the delete itself already succeeded and is the only
      // thing that must not fail silently here -- a failed post-delete
      // refetch shouldn't be reported through the same catch as a failed
      // delete, which would misrepresent an already-successful,
      // non-reversible delete as failed.
      queryClient.invalidateQueries({ queryKey: ['fits', userId] }).catch(() => {});
      router.back();
    } catch (error) {
      if (error instanceof FitError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleDeletePress() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Delete', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          void handleDelete();
        }
      },
    );
  }

  function handleEditPress() {
    if (!fit) {
      return;
    }
    router.push({ pathname: '/new-fit', params: { fitId: fit.id } });
  }

  const header = <BackHeader disabled={deleting} />;

  if (!userId || isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  if (isListError) {
    const message = isNoConnectionError(listError) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="px-gutter">
          <View className="mb-6">
            <ConnectionErrorNotice message={message} />
          </View>
          <Button title="Retry" variant="primary" onPress={() => refetchFits()} />
        </View>
      </View>
    );
  }

  if (!fit) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            This Fit is no longer available.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      {/*
       * Not a ScrollView -- name/meta/actions below are fixed-height, so this
       * card is the only flexible element and simply takes whatever room
       * they leave, the same "canvas fills the remaining space, controls sit
       * in a fixed footer below it" layout `new-fit.tsx`'s builder screen
       * uses. `contentFit="contain"` (not "cover") so a portrait Fit is
       * never cropped -- it just letterboxes within the space available.
       */}
      <View className="flex-1 px-gutter pt-4 pb-3">
        <View
          style={COVER_SHADOW}
          className="flex-1 overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark"
        >
          {isEmptyFit ? (
            <View testID="fit-detail-empty" className="flex-1 items-center justify-center px-gutter">
              <Text variant="body" className="mb-6 text-center text-ink-secondary dark:text-ink-secondaryDark">
                This Fit has no items left.
              </Text>
              <Button title="Add item" variant="primary" onPress={handleEditPress} />
            </View>
          ) : coverUrl ? (
            <Image
              testID="fit-detail-cover"
              accessibilityLabel="Fit collage"
              source={{ uri: coverUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : (
            <View testID="fit-detail-cover-fallback" className="h-full w-full" />
          )}
        </View>
      </View>
      <View
        style={{ paddingBottom: insets.bottom + 12 }}
        className="border-t border-border-hairline px-gutter pt-4 dark:border-border-hairlineDark"
      >
        {showAck ? (
          <Text accessibilityRole="alert" variant="body" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
            Fit updated.
          </Text>
        ) : null}
        <Text variant="display" className="mb-1 text-accent dark:text-accentDark">
          {fit.name}
        </Text>
        <Text variant="meta" className="mb-4 uppercase tracking-widest text-ink-secondary dark:text-ink-secondaryDark">
          Updated {UPDATED_AT_FORMAT.format(new Date(fit.updated_at))}
        </Text>

        {errorMessage ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}
        {/* Empty state above already offers its own "Add items" CTA for this exact action -- avoid two differently-labeled buttons for the same thing. */}
        {isEmptyFit ? null : <Button title="Edit" variant="primary" onPress={handleEditPress} disabled={deleting} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Fit"
          onPress={handleDeletePress}
          disabled={deleting}
          className="mt-2 items-center py-2"
        >
          <Text variant="label" className="uppercase tracking-widest text-destructive dark:text-destructiveDark">
            {deleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
