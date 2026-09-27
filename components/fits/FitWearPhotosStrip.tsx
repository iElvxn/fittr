import { ActivityIndicator, Pressable, ScrollView, useColorScheme, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { CameraIcon } from '@/components/ui/icons/CameraIcon';
import { WearPhotoImage } from '@/components/fits/WearPhotoImage';
import type { FitWearPhoto } from '@/lib/fits/fitWearPhotos';
import { useWearPhotoUrls } from '@/lib/fits/wearPhoto';
import { longDateLabel, shortDateLabel } from '@/lib/planner/week';
import { colors } from '@/lib/theme/colors';

const TILE_WIDTH = 108;
/** 3:4, like Item detail's Fits strip. Fixed: tiles keep their size at every text size. */
const TILE_HEIGHT = TILE_WIDTH * (4 / 3);
const TILE_GAP = 10;
const SKELETON_TILES = 4;
/** Same veil as the day sheet's saving photo: the base surface, part-transparent. */
const SAVING_VEIL = { light: 'rgba(246,244,238,0.66)', dark: 'rgba(26,24,22,0.62)' };

export type FitWearPhotoAdd = {
  /** A picked file still saving -- the tile shows it under the "Saving" veil. */
  savingUri: string | null;
  /** Another write is in flight: the tile ignores taps. */
  busy: boolean;
  onPress: () => void;
};

type Props = {
  /** Newest first. */
  photos: FitWearPhoto[];
  today: string;
  /** The photos are still loading: skeleton tiles stand in for them. */
  loading: boolean;
  /** Today's wear has no photo yet: a dashed "Add a photo" tile leads the strip. */
  add: FitWearPhotoAdd | null;
  onOpenDay: (date: string) => void;
};

function DateCaption({ date, today }: { date: string; today: string }) {
  const isToday = date === today;
  return (
    <Text
      variant="caption"
      className={
        isToday
          ? 'mt-2 px-0.5 text-ink-primary dark:text-ink-primaryDark'
          : 'mt-2 px-0.5 text-ink-secondary dark:text-ink-secondaryDark'
      }
    >
      {isToday ? 'Today' : shortDateLabel(date, today)}
    </Text>
  );
}

/**
 * Story 5.5: Fit detail's "Worn" strip (the P7 mockup row). Every photo taken
 * of this Fit, newest first, as small 3:4 thumbnails with the day under each
 * -- a plain sideways scroll like `ItemFitsStrip`, not a paging carousel.
 * Tapping a photo opens that day in the Planner. Only thumbnails load here,
 * all signed in one request.
 */
export function FitWearPhotosStrip({ photos, today, loading, add, onOpenDay }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { data: photoUrls } = useWearPhotoUrls(photos.map((wear) => wear.photo.thumbPath));

  return (
    <ScrollView
      testID="fit-wear-photos-strip"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="px-gutter"
      contentContainerStyle={{ gap: TILE_GAP }}
    >
      {add ? (
        <View style={{ width: TILE_WIDTH }}>
          {add.savingUri ? (
            <View
              testID="fit-wear-photo-saving"
              accessible
              accessibilityLabel="Saving your photo"
              accessibilityState={{ busy: true }}
              style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
              className="overflow-hidden rounded-md bg-surface-tile dark:bg-surface-tileDark"
            >
              <WearPhotoImage path="" url={null} thumbhash={null} localUri={add.savingUri} />
              <View
                style={{ backgroundColor: scheme === 'dark' ? SAVING_VEIL.dark : SAVING_VEIL.light }}
                className="absolute inset-0 items-center justify-center gap-2"
              >
                <ActivityIndicator color={palette.inkPrimary} />
                <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
                  Saving
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              testID="fit-wear-photo-add"
              accessibilityRole="button"
              accessibilityLabel="Add a photo of what you wore today"
              accessibilityState={{ disabled: add.busy }}
              onPress={add.onPress}
              disabled={add.busy}
              style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
              className="items-center justify-center rounded-md border border-dashed border-ink-disabled active:opacity-60 dark:border-ink-disabledDark"
            >
              <CameraIcon size={24} color={add.busy ? palette.inkDisabled : palette.inkPrimary} />
            </Pressable>
          )}
          <DateCaption date={today} today={today} />
        </View>
      ) : null}

      {loading
        ? Array.from({ length: SKELETON_TILES }, (_, index) => (
            <View
              key={index}
              testID="fit-wear-photo-skeleton"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
              className="rounded-md bg-surface-tile dark:bg-surface-tileDark"
            />
          ))
        : photos.map((wear) => (
            <Pressable
              key={wear.id}
              testID="fit-wear-photo"
              accessibilityRole="button"
              accessibilityLabel={`Your photo from ${longDateLabel(wear.wornOn, today)}. Open that day in the Planner`}
              onPress={() => onOpenDay(wear.wornOn)}
              style={{ width: TILE_WIDTH }}
              className="active:opacity-80"
            >
              <View
                style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
                className="overflow-hidden rounded-md bg-surface-tile dark:bg-surface-tileDark"
              >
                <WearPhotoImage
                  testID="fit-wear-photo-image"
                  path={wear.photo.thumbPath}
                  url={photoUrls?.[wear.photo.thumbPath]}
                  thumbhash={wear.photo.thumbhash}
                />
              </View>
              <DateCaption date={wear.wornOn} today={today} />
            </Pressable>
          ))}
    </ScrollView>
  );
}
