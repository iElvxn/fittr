import { PixelRatio, Pressable, useColorScheme, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import type { FitRow } from '@/lib/fits/listFits';
import { colors } from '@/lib/theme/colors';

/** Same 3:4 as every Fit tile, sized to sit beside the name in the sheet. */
const COLLAGE_WIDTH = 96;
const COLLAGE_HEIGHT = 128;
const NAME_FONT_SIZE = 22;
const NAME_LINE_HEIGHT = 28;

export type DayFitWornToggle = {
  isWornToday: boolean;
  onToggle: () => void;
};

type Props = {
  fit: FitRow;
  coverUrl: string | null;
  /** "Planned · Worn 2×", "Worn", or Home's wording on today. Empty hides the line. */
  status: string;
  /** False once the wear's photo section shows, which carries the collage itself. */
  showCollage: boolean;
  /** Any write in the sheet is in flight: every control ignores taps. */
  busy: boolean;
  onViewFit: () => void;
  /** Today only: Mark worn / Worn today, sharing Home's toggle. */
  wornToggle?: DayFitWornToggle | null;
};

/**
 * Story 5.6: the day's Fit at the top of the day sheet -- the 3:4 collage
 * (filled like the grid tiles), the serif name and a status caption, then
 * View Fit and, on today only, the same Mark worn / Worn today toggle as
 * Home's card. Worn is shown by fill vs outline alone. The buttons wrap
 * rather than clip at large Dynamic Type sizes.
 */
export function DayFitHeader({ fit, coverUrl, status, showCollage, busy, onViewFit, wornToggle = null }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const fontScale = PixelRatio.getFontScale();

  return (
    <View testID="day-fit-header" className="gap-4">
      <View className="flex-row items-end gap-3.5">
        {showCollage ? (
          <View
            testID="day-fit-header-collage"
            style={[
              { width: COLLAGE_WIDTH, height: COLLAGE_HEIGHT },
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
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1">
          <Text
            variant="title"
            style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
            className="text-ink-primary dark:text-ink-primaryDark"
          >
            {fit.name}
          </Text>
          {status ? (
            <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
              {status}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2.5">
        {wornToggle ? (
          <View className="grow">
            {wornToggle.isWornToday ? (
              <Button
                title="Worn today"
                variant="secondary"
                accessibilityLabel="Worn today. Tap to undo"
                accessibilityState={{ selected: true, busy }}
                leftIcon={<CheckIcon size={15} color={palette.inkPrimary} />}
                onPress={busy ? undefined : wornToggle.onToggle}
              />
            ) : (
              <Button
                title="Mark worn"
                variant="primary"
                accessibilityState={{ selected: false, busy }}
                leftIcon={<CheckIcon size={15} color={palette.surfaceBase} />}
                onPress={busy ? undefined : wornToggle.onToggle}
              />
            )}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Fit"
          accessibilityState={{ disabled: busy }}
          onPress={onViewFit}
          disabled={busy}
          className={[
            'min-h-12 items-center justify-center rounded-sm border border-border-hairline px-6 active:opacity-60 dark:border-border-hairlineDark',
            wornToggle ? '' : 'grow',
          ].join(' ')}
        >
          <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
            View Fit
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
