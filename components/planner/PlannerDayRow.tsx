import { PixelRatio, Pressable, useColorScheme, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { ChevronRightIcon } from '@/components/ui/icons/ChevronRightIcon';
import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import type { FitRow } from '@/lib/fits/listFits';
import type { WeekDay } from '@/lib/planner/week';
import { colors } from '@/lib/theme/colors';

/** Same fixed 3:4 as every other Fit tile, at the mockup's row size. */
export const DAY_TILE_WIDTH = 72;
export const DAY_TILE_HEIGHT = 96;
export const DAY_ROW_MIN_HEIGHT = 116;
/** Fixed column so the tiles line up down the week whatever the day caption. */
export const DAY_LABEL_WIDTH = 52;
const DATE_FONT_SIZE = 28;
const DATE_LINE_HEIGHT = 32;
const NAME_FONT_SIZE = 19;
const NAME_LINE_HEIGHT = 24;
const EMPTY_FONT_SIZE = 14;
const EMPTY_LINE_HEIGHT = 20;

type Props = {
  day: WeekDay;
  /** The day's live Fit, or null for an empty day (including a plan whose Fit was deleted). */
  fit: FitRow | null;
  coverUrl: string | null;
  /** "Worn", "Planned for today" or "Planned"; unused on an empty day. */
  meta: string;
  onPress: () => void;
};

/**
 * One Planner day: the day caption and serif date, then either the planned
 * Fit's tile, name and status or a dashed empty slot. The whole row is one
 * button that opens the day sheet. Today is marked by weight alone -- the
 * "Today" caption in full ink and a small ink dot -- never a color.
 */
export function PlannerDayRow({ day, fit, coverUrl, meta, onPress }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const fontScale = PixelRatio.getFontScale();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day.long}: ${fit ? fit.name : 'nothing planned'}`}
      onPress={onPress}
      style={{ minHeight: DAY_ROW_MIN_HEIGHT }}
      className="flex-row items-center gap-3.5 border-t border-border-hairline py-2.5 active:opacity-80 dark:border-border-hairlineDark"
    >
      <View style={{ width: DAY_LABEL_WIDTH }} className="gap-0.5">
        <Text
          variant="caption"
          className={
            day.isToday ? 'text-ink-primary dark:text-ink-primaryDark' : 'text-ink-secondary dark:text-ink-secondaryDark'
          }
        >
          {day.isToday ? 'Today' : day.dow}
        </Text>
        <Text
          variant="title"
          style={{ fontSize: DATE_FONT_SIZE * fontScale, lineHeight: DATE_LINE_HEIGHT * fontScale }}
          className={
            day.isPast ? 'text-ink-secondary dark:text-ink-secondaryDark' : 'text-ink-primary dark:text-ink-primaryDark'
          }
        >
          {String(day.dayOfMonth)}
        </Text>
        {day.isToday ? (
          <View testID="planner-today-dot" className="mt-0.5 h-1.5 w-1.5 rounded-full bg-ink-primary dark:bg-ink-primaryDark" />
        ) : null}
      </View>

      {fit ? (
        <>
          <View
            testID={`planner-tile-${day.date}`}
            style={[
              { width: DAY_TILE_WIDTH, height: DAY_TILE_HEIGHT },
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
          <View className="min-w-0 flex-1 gap-1">
            <Text
              variant="title"
              numberOfLines={1}
              style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
              className="text-ink-primary dark:text-ink-primaryDark"
            >
              {fit.name}
            </Text>
            <Text variant="caption" numberOfLines={1} className="text-ink-secondary dark:text-ink-secondaryDark">
              {meta}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View
            style={{ width: DAY_TILE_WIDTH, height: DAY_TILE_HEIGHT }}
            className="items-center justify-center rounded-lg border border-dashed border-ink-disabled dark:border-ink-disabledDark"
          >
            <PlusIcon size={18} color={palette.inkSecondary} />
          </View>
          <Text
            variant="body"
            style={{ fontSize: EMPTY_FONT_SIZE * fontScale, lineHeight: EMPTY_LINE_HEIGHT * fontScale }}
            className="flex-1 text-ink-secondary dark:text-ink-secondaryDark"
          >
            Nothing planned
          </Text>
        </>
      )}

      <ChevronRightIcon size={16} color={palette.inkSecondary} />
    </Pressable>
  );
}
