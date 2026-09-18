import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

const GUTTER = 16;
const ACK_DURATION_MS = 2500;

/**
 * Scoped to exactly what Story 3.3 needs -- collage, name, Edit, Delete.
 * Favorite/Wear/Plan/Share (EXPERIENCE.md's full Fit-detail action set)
 * belong to their own later stories and get no placeholders here.
 */
export default function FitDetail() {
  const { id, fitUpdated } = useLocalSearchParams<{ id: string; fitUpdated?: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const coverSize = width - GUTTER * 2;

  // Same "already-cached list is the single source of truth" convention as
  // `app/item/[id].tsx` -- no separate single-Fit query.
  const { data: fits, isLoading, isError: isListError, error: listError, refetch: refetchFits } = useFits(userId);
  const fit = fits?.find((candidate) => candidate.id === id);

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
      <ScrollView contentContainerClassName="px-gutter pb-10">
        <View style={{ width: coverSize, height: coverSize }} className="mb-12 self-center">
          {coverUrl ? (
            <Image
              testID="fit-detail-cover"
              accessibilityLabel="Fit collage"
              source={{ uri: coverUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : (
            <View
              testID="fit-detail-cover-fallback"
              className="h-full w-full rounded-sm bg-surface-raised dark:bg-surface-raisedDark"
            />
          )}
        </View>

        {showAck ? (
          <Text accessibilityRole="alert" variant="body" className="mb-4 text-ink-primary dark:text-ink-primaryDark">
            Fit updated.
          </Text>
        ) : null}

        {errorMessage ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}

        <Text variant="display" className="mb-9 text-accent dark:text-accentDark">
          {fit.name}
        </Text>

        <View className="mb-6 flex-row items-stretch gap-3 border-t border-border-hairline pt-6 dark:border-border-hairlineDark">
          <Button title="Edit" onPress={handleEditPress} disabled={deleting} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Fit"
          onPress={handleDeletePress}
          disabled={deleting}
          className="items-center py-2"
        >
          <Text variant="label" className="uppercase tracking-widest text-destructive dark:text-destructiveDark">
            {deleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
