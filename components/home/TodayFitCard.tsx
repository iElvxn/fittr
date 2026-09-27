import { PixelRatio, Pressable, useColorScheme, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { WornTodayButton } from '@/components/fits/WornTodayButton';
import { CameraIcon } from '@/components/ui/icons/CameraIcon';
import { ChevronRightIcon } from '@/components/ui/icons/ChevronRightIcon';
import { WearPhotoImage } from '@/components/fits/WearPhotoImage';
import type { WearPhoto } from '@/lib/fits/wearRef';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import type { FitRow } from '@/lib/fits/listFits';
import { colors } from '@/lib/theme/colors';

const TILE_ASPECT_RATIO = 3 / 4;
const NAME_FONT_SIZE = 28;
const NAME_LINE_HEIGHT = 34;
const CHANGE_BUTTON_WIDTH = 104;
const PHOTO_THUMB_WIDTH = 45;
const PHOTO_THUMB_HEIGHT = 60;
const PHOTO_HINT_FONT_SIZE = 13;
const PHOTO_HINT_LINE_HEIGHT = 18;

type Props = {
  fit: FitRow;
  coverUrl: string | null;
  /** "Planned for today · Worn 3×", or "Worn 4× · including today" once worn. */
  meta: string;
  isWornToday: boolean;
  /** A wear write is in flight: the toggle ignores taps until it settles. */
  busy: boolean;
  errorMessage: string | null;
  onOpen: () => void;
  onToggleWorn: () => void;
  onChange: () => void;
  /** Story 5.4: today's wear photo and its thumbnail's signed URL, once there is one. */
  photo?: (WearPhoto & { url: string | null }) | null;
  /** Today's wear exists and has no photo yet. */
  canAddPhoto?: boolean;
  /** A photo is being picked or saved: the add action ignores taps. */
  photoBusy?: boolean;
  photoSaving?: boolean;
  onAddPhoto?: () => void;
  /** Opens today's day sheet, where the photo is replaced or removed. */
  onOpenPhoto?: () => void;
};

/**
 * Today's planned Fit on Home: a full-width 3:4 tile filled with the Fit's
 * canvas color (cover contained, as in the Planner), the serif name and a
 * meta line, then Mark worn and Change. Solid means worn: the outlined
 * "Mark worn" becomes a solid "Worn today" with a check that undoes the
 * wear (`WornTodayButton`).
 *
 * Story 5.4: once today's wear exists, "Add a photo" sits under the buttons;
 * with a photo, a row shows its thumbnail and opens today's day sheet. The
 * big tile always keeps the collage.
 */
export function TodayFitCard({
  fit,
  coverUrl,
  meta,
  isWornToday,
  busy,
  errorMessage,
  onOpen,
  onToggleWorn,
  onChange,
  photo = null,
  canAddPhoto = false,
  photoBusy = false,
  photoSaving = false,
  onAddPhoto,
  onOpenPhoto,
}: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const fontScale = PixelRatio.getFontScale();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${fit.name}`}
        onPress={onOpen}
        style={[
          { width: '100%', aspectRatio: TILE_ASPECT_RATIO },
          fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
        ]}
        className={
          fit.canvas_background_color
            ? 'overflow-hidden rounded-lg active:opacity-90'
            : 'overflow-hidden rounded-lg bg-surface-raised active:opacity-90 dark:bg-surface-raisedDark'
        }
      >
        {coverUrl ? (
          <Image accessibilityLabel="" source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : null}
      </Pressable>

      <View className="gap-1 px-0.5 pt-4">
        <Text
          variant="title"
          style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
          className="text-ink-primary dark:text-ink-primaryDark"
        >
          {fit.name}
        </Text>
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          {meta}
        </Text>
      </View>

      <View className="flex-row gap-2.5 pt-4">
        <View className="flex-1">
          <WornTodayButton isWornToday={isWornToday} busy={busy} onToggle={onToggleWorn} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change today's Fit"
          onPress={onChange}
          style={{ width: CHANGE_BUTTON_WIDTH }}
          className="min-h-12 items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
            Change
          </Text>
        </Pressable>
      </View>

      {photo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Today's photo. Open to replace or remove"
          onPress={onOpenPhoto}
          className="mt-3.5 flex-row items-center gap-3 border-t border-border-hairline pt-3.5 active:opacity-70 dark:border-border-hairlineDark"
        >
          <View
            style={{ width: PHOTO_THUMB_WIDTH, height: PHOTO_THUMB_HEIGHT }}
            className="overflow-hidden rounded-md bg-surface-tile dark:bg-surface-tileDark"
          >
            <WearPhotoImage testID="home-wear-photo" path={photo.thumbPath} url={photo.url} thumbhash={photo.thumbhash} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
              Today&apos;s photo
            </Text>
            <Text
              variant="body"
              style={{ fontSize: PHOTO_HINT_FONT_SIZE * fontScale, lineHeight: PHOTO_HINT_LINE_HEIGHT * fontScale }}
              className="text-ink-secondary dark:text-ink-secondaryDark"
            >
              Replace or remove it in the Planner
            </Text>
          </View>
          <ChevronRightIcon size={16} color={palette.inkSecondary} />
        </Pressable>
      ) : canAddPhoto ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          accessibilityState={{ busy: photoBusy, disabled: photoBusy }}
          onPress={onAddPhoto}
          disabled={photoBusy}
          className="mt-2 min-h-11 flex-row items-center gap-2 self-start px-0.5 active:opacity-60"
        >
          <CameraIcon size={18} color={palette.inkPrimary} />
          <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
            {photoSaving ? 'Saving' : 'Add a photo'}
          </Text>
        </Pressable>
      ) : null}

      {errorMessage ? (
        <View className="pt-4">
          <ConnectionErrorNotice message={errorMessage} />
        </View>
      ) : null}
    </View>
  );
}
