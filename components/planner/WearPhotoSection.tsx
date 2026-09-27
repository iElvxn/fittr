import { ActivityIndicator, PixelRatio, Pressable, useColorScheme, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CameraIcon } from '@/components/ui/icons/CameraIcon';
import { WearPhotoImage } from '@/components/fits/WearPhotoImage';
import type { FitRow } from '@/lib/fits/listFits';
import { useWearPhotoUrls, type WearRef } from '@/lib/fits/wearPhoto';
import { colors } from '@/lib/theme/colors';

const GUTTER = 16;
const HALF_GAP = 12;
const ACTION_HEIGHT = 44;
const HINT_FONT_SIZE = 13;
const HINT_LINE_HEIGHT = 18;
/** The veil only dims the photo under "Saving"; it's the base surface, part-transparent. */
const SAVING_VEIL = { light: 'rgba(246,244,238,0.66)', dark: 'rgba(26,24,22,0.62)' };

type Props = {
  /** The day's long label, e.g. "Monday, Sep 22", for the photo's VoiceOver label. */
  dayLabel: string;
  /** The Fit worn that day. */
  fit: FitRow;
  wear: WearRef;
  coverUrl: string | null;
  /** A picked file still uploading for this wear, shown under the "Saving" veil. */
  savingUri: string | null;
  /** Any write is in flight: every control ignores taps. */
  busy: boolean;
  onAddPhoto: () => void;
  onRemovePhoto: () => void;
};

/**
 * Story 5.4's day-sheet section for a worn day (P5Photos boards): the wear
 * photo and the Fit's collage side by side at 3:4, then Replace and Remove.
 * With no photo, the photo half is a dashed "Add a photo" slot. Only this
 * sheet ever loads the full-size photo; tiles load thumbnails.
 */
export function WearPhotoSection({ dayLabel, fit, wear, coverUrl, savingUri, busy, onAddPhoto, onRemovePhoto }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { width } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const photo = wear.photo;
  const { data: photoUrls } = useWearPhotoUrls(photo ? [photo.path] : []);

  const halfWidth = (width - GUTTER * 2 - HALF_GAP) / 2;
  const halfHeight = halfWidth * (4 / 3);
  const showsPhoto = Boolean(photo || savingUri);

  return (
    <View className="gap-4">
      <View className="flex-row" style={{ columnGap: HALF_GAP }}>
        {showsPhoto ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Your photo from ${dayLabel}`}
            style={{ width: halfWidth, height: halfHeight }}
            className="overflow-hidden rounded-lg bg-surface-tile dark:bg-surface-tileDark"
          >
            <WearPhotoImage
              testID="wear-photo-full"
              path={photo?.path ?? ''}
              url={photo ? photoUrls?.[photo.path] : null}
              thumbhash={savingUri ? null : (photo?.thumbhash ?? null)}
              localUri={savingUri ?? undefined}
            />
            {savingUri ? (
              <View
                style={{ backgroundColor: scheme === 'dark' ? SAVING_VEIL.dark : SAVING_VEIL.light }}
                className="absolute inset-0 items-center justify-center gap-2.5"
              >
                <ActivityIndicator color={palette.inkPrimary} />
                <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
                  Saving
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo of what you wore"
            accessibilityState={{ disabled: busy }}
            onPress={onAddPhoto}
            disabled={busy}
            style={{ width: halfWidth, height: halfHeight }}
            className="items-center justify-center gap-3 rounded-lg border border-dashed border-ink-disabled px-4 active:opacity-60 dark:border-ink-disabledDark"
          >
            <CameraIcon size={26} color={palette.inkPrimary} />
            <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
              Add a photo
            </Text>
            <Text
              variant="body"
              style={{ fontSize: HINT_FONT_SIZE * fontScale, lineHeight: HINT_LINE_HEIGHT * fontScale }}
              className="text-center text-ink-secondary dark:text-ink-secondaryDark"
            >
              How it actually looked on you
            </Text>
          </Pressable>
        )}

        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${fit.name} collage`}
          style={[
            { flex: 1, height: halfHeight },
            fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
          ]}
          className={
            fit.canvas_background_color
              ? 'overflow-hidden rounded-lg'
              : 'overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark'
          }
        >
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : null}
        </View>
      </View>

      {photo && !savingUri ? (
        <View className="flex-row gap-2.5">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            onPress={onAddPhoto}
            disabled={busy}
            style={{ minHeight: ACTION_HEIGHT }}
            className="flex-1 items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
          >
            <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
              Replace photo
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            onPress={onRemovePhoto}
            disabled={busy}
            style={{ minHeight: ACTION_HEIGHT }}
            className="flex-1 items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
          >
            <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
              Remove photo
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
