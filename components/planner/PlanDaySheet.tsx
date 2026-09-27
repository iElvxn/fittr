import { Modal, PixelRatio, Pressable, ScrollView, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { WearPhotoSection } from '@/components/planner/WearPhotoSection';
import { DayFitHeader, type DayFitWornToggle } from '@/components/planner/DayFitHeader';
import type { WearRef } from '@/lib/fits/wearRef';
import type { FitRow } from '@/lib/fits/listFits';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import type { WeekDay } from '@/lib/planner/week';
import { colors } from '@/lib/theme/colors';

const COLUMNS = 3;
const COLUMN_GAP = 8;
const ROW_GAP = 14;
const GUTTER = 16;
const CLOSE_BUTTON_SIZE = 44;
const CHECK_BADGE_SIZE = 24;
const NAME_FONT_SIZE = 14;
const NAME_LINE_HEIGHT = 18;
/** Leaves the week visible above the sheet; the grid scrolls inside it. */
const MAX_HEIGHT_FRACTION = 0.85;

type Props = {
  /** The day being planned; null hides the sheet. */
  day: WeekDay | null;
  fits: FitRow[];
  /** The day's current live Fit, if any. */
  selectedFitId: string | null;
  thumbnailUrls: ThumbnailUrlMap | undefined;
  /** A write is in flight: every control ignores taps until it settles. */
  busy: boolean;
  errorMessage: string | null;
  onPick: (fitId: string) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Story 5.4: the Fit worn that day and its wear, which gives the sheet its photo section. Null on a day not worn. */
  worn?: { fit: FitRow; wear: WearRef } | null;
  /** A picked photo still saving for that wear. */
  photoSavingUri?: string | null;
  onAddPhoto?: (wear: WearRef) => void;
  onRemovePhoto?: (wear: WearRef) => void;
  /**
   * Story 5.6: the day's Fit to lead with -- the planned one, else the one
   * worn that day -- with its status, View Fit and (today only) the worn
   * toggle. Null on an empty day, which opens straight on the grid.
   */
  header?: {
    fit: FitRow;
    status: string;
    onViewFit: () => void;
    wornToggle?: DayFitWornToggle | null;
  } | null;
};

/**
 * The Planner's day sheet: pick a Fit for one day from a 3-column grid of
 * every saved Fit, or remove the day's Fit. Same bottom-sheet shape as
 * `CanvasBackgroundSheet` (scrim, handle, `rounded-t-lg`). The current pick
 * wears an ink check badge. The sheet stays open through a failed write so
 * the error shows where the user tapped.
 *
 * Story 5.4: on a worn day the wear's photo section sits above the grid. A
 * photo write locks the sheet like a plan write does.
 *
 * Story 5.6: a day with a Fit leads with `DayFitHeader` above the photo
 * section; the caption is then just the day, and the grid sits under
 * "Change Fit" (or "Choose a Fit" when nothing is planned). The header drops
 * its collage when the photo section shows. A wear toggle locks the sheet too.
 */
export function PlanDaySheet({
  day,
  fits,
  selectedFitId,
  thumbnailUrls,
  busy,
  errorMessage,
  onPick,
  onRemove,
  onClose,
  worn = null,
  photoSavingUri = null,
  onAddPhoto,
  onRemovePhoto,
  header = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { width, height } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();

  if (!day) {
    return null;
  }

  const tileWidth = (width - GUTTER * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
  const tileHeight = tileWidth * (4 / 3);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={busy ? () => {} : onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          disabled={busy}
          className="absolute inset-0 bg-black/40"
        />
        <View
          accessibilityViewIsModal
          style={{ maxHeight: height * MAX_HEIGHT_FRACTION, paddingBottom: insets.bottom + 16 }}
          className="rounded-t-lg bg-surface-base pt-2 dark:bg-surface-baseDark"
        >
          <View className="items-center pb-2 pt-1">
            <View className="h-1 w-9 rounded-full bg-border-hairline dark:bg-border-hairlineDark" />
          </View>
          <View className="flex-row items-start justify-between gap-3 px-gutter pb-4">
            <View className="shrink gap-1">
              {header ? null : (
                <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
                  Choose a Fit
                </Text>
              )}
              <Text accessibilityRole="header" variant="title" className="text-ink-primary dark:text-ink-primaryDark">
                {day.long}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              disabled={busy}
              style={{ width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE }}
              className="items-center justify-center"
            >
              <CloseIcon size={18} color={palette.inkPrimary} />
            </Pressable>
          </View>

          {errorMessage ? (
            <View className="px-gutter pb-4">
              <ConnectionErrorNotice message={errorMessage} />
            </View>
          ) : null}

          {/* One scroll for the photo and the grid, so both fit on a small screen. */}
          <ScrollView contentContainerClassName="px-gutter" style={{ flexGrow: 0 }}>
            {header ? (
              <View className="pb-4">
                <DayFitHeader
                  fit={header.fit}
                  coverUrl={header.fit.cover_path ? (thumbnailUrls?.[header.fit.cover_path] ?? null) : null}
                  status={header.status}
                  showCollage={!worn}
                  busy={busy}
                  onViewFit={header.onViewFit}
                  wornToggle={header.wornToggle}
                />
              </View>
            ) : null}
            {worn ? (
              <View className="pb-4">
                <WearPhotoSection
                  dayLabel={day.long}
                  fit={worn.fit}
                  wear={worn.wear}
                  coverUrl={worn.fit.cover_path ? (thumbnailUrls?.[worn.fit.cover_path] ?? null) : null}
                  savingUri={photoSavingUri}
                  busy={busy}
                  onAddPhoto={() => onAddPhoto?.(worn.wear)}
                  onRemovePhoto={() => onRemovePhoto?.(worn.wear)}
                />
              </View>
            ) : null}
            {header || worn ? (
              <View className="pb-4">
                <View className="h-px bg-border-hairline dark:bg-border-hairlineDark" />
                <Text variant="caption" className="pt-4 text-ink-secondary dark:text-ink-secondaryDark">
                  {selectedFitId ? 'Change Fit' : 'Choose a Fit'}
                </Text>
              </View>
            ) : null}
            <View className="flex-row flex-wrap" style={{ columnGap: COLUMN_GAP, rowGap: ROW_GAP }}>
              {fits.map((fit) => {
                const selected = fit.id === selectedFitId;
                const coverUrl = fit.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;
                return (
                  <Pressable
                    key={fit.id}
                    accessibilityRole="button"
                    accessibilityLabel={fit.name}
                    accessibilityState={{ selected, disabled: busy }}
                    onPress={() => onPick(fit.id)}
                    disabled={busy}
                    style={{ width: tileWidth }}
                    className="active:opacity-80"
                  >
                    <View
                      style={[
                        { width: tileWidth, height: tileHeight },
                        fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
                      ]}
                      className={
                        fit.canvas_background_color
                          ? 'overflow-hidden rounded-lg'
                          : 'overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark'
                      }
                    >
                      {coverUrl ? (
                        <Image
                          accessibilityLabel=""
                          source={{ uri: coverUrl }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="contain"
                        />
                      ) : null}
                      {selected ? (
                        <View
                          testID={`plan-sheet-check-${fit.id}`}
                          style={{ width: CHECK_BADGE_SIZE, height: CHECK_BADGE_SIZE }}
                          className="absolute right-1.5 top-1.5 items-center justify-center rounded-full bg-ink-primary dark:bg-ink-primaryDark"
                        >
                          <CheckIcon size={13} color={palette.surfaceBase} />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      variant="title"
                      numberOfLines={1}
                      style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
                      className="mt-1.5 px-0.5 text-ink-primary dark:text-ink-primaryDark"
                    >
                      {fit.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {selectedFitId ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRemove}
              disabled={busy}
              className="mt-4 min-h-11 items-center justify-center px-gutter"
            >
              <Text variant="caption" className="text-destructive dark:text-destructiveDark">
                {`Remove from ${day.weekday}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
