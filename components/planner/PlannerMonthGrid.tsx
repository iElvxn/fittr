import { PixelRatio, Pressable, useColorScheme, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import type { FitRow } from '@/lib/fits/listFits';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import type { WeekDay } from '@/lib/planner/week';
import { colors } from '@/lib/theme/colors';

export const MONTH_WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const MONTH_COLUMN_GAP = 4;
export const MONTH_ROW_GAP = 10;
export const MONTH_TILE_ASPECT_RATIO = 3 / 4;
const DATE_FONT_SIZE = 15;
const DATE_LINE_HEIGHT = 20;
const TODAY_BORDER_WIDTH = 1.5;
const BADGE_SIZE = 16;

/** What a month day shows: its planned Fit, else a live Fit worn that day. */
export type MonthDayFit = { fit: FitRow; worn: boolean };

type Props = {
  weeks: (WeekDay | null)[][];
  dayFits: Map<string, MonthDayFit>;
  thumbnailUrls: ThumbnailUrlMap | undefined;
  onOpenDay: (date: string) => void;
};

function WornBadge({ testID }: { testID?: string }) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return (
    <View
      testID={testID}
      style={{ width: BADGE_SIZE, height: BADGE_SIZE }}
      className="items-center justify-center rounded-full bg-ink-primary dark:bg-ink-primaryDark"
    >
      <CheckIcon size={10} color={palette.surfaceBase} />
    </View>
  );
}

function MonthCell({
  day,
  dayFit,
  coverUrl,
  onPress,
}: {
  day: WeekDay;
  dayFit: MonthDayFit | undefined;
  coverUrl: string | null;
  onPress: () => void;
}) {
  const fontScale = PixelRatio.getFontScale();
  const fit = dayFit?.fit ?? null;
  const status = fit ? `${fit.name}, ${dayFit?.worn ? 'worn' : 'planned'}` : 'nothing planned';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day.long}${day.isToday ? ', today' : ''}: ${status}`}
      onPress={onPress}
      className="flex-1 items-center gap-1 active:opacity-70"
    >
      <View
        testID={day.isToday ? 'planner-month-today' : undefined}
        style={{ minWidth: 22 * fontScale }}
        className={
          day.isToday ? 'items-center rounded-sm bg-ink-primary px-1 dark:bg-ink-primaryDark' : 'items-center px-1'
        }
      >
        <Text
          variant="title"
          style={{
            fontSize: DATE_FONT_SIZE * fontScale,
            lineHeight: DATE_LINE_HEIGHT * fontScale,
          }}
          className={
            day.isToday
              ? 'text-surface-base dark:text-surface-baseDark'
              : day.isPast
                ? 'text-ink-secondary dark:text-ink-secondaryDark'
                : 'text-ink-primary dark:text-ink-primaryDark'
          }
        >
          {String(day.dayOfMonth)}
        </Text>
      </View>
      {fit ? (
        <View
          testID={`planner-month-tile-${day.date}`}
          style={[
            { width: '100%', aspectRatio: MONTH_TILE_ASPECT_RATIO },
            fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
            day.isToday ? { borderWidth: TODAY_BORDER_WIDTH } : null,
          ]}
          className={[
            'overflow-hidden rounded-md',
            fit.canvas_background_color ? '' : 'bg-surface-raised dark:bg-surface-raisedDark',
            day.isToday ? 'border-ink-primary dark:border-ink-primaryDark' : '',
          ].join(' ')}
        >
          {coverUrl ? (
            <Image
              accessibilityLabel=""
              source={{ uri: coverUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : null}
          {dayFit?.worn ? (
            <View className="absolute right-1 top-1">
              <WornBadge testID={`planner-month-worn-${day.date}`} />
            </View>
          ) : null}
        </View>
      ) : (
        // Every day keeps the same slot, so a week with nothing planned
        // doesn't collapse -- the same dashed treatment as the week view's
        // empty row and Home's week strip.
        <View
          testID={`planner-month-empty-${day.date}`}
          style={{ width: '100%', aspectRatio: MONTH_TILE_ASPECT_RATIO }}
          className={
            day.isToday
              ? 'rounded-md border border-dashed border-ink-primary dark:border-ink-primaryDark'
              : 'rounded-md border border-dashed border-ink-disabled dark:border-ink-disabledDark'
          }
        />
      )}
    </Pressable>
  );
}

/**
 * Story 5.3's month: Monday-first weeks of day buttons. A day with a Fit
 * shows its mini 3:4 tile (filled like the week view's), badged with an ink
 * check when that Fit was worn that day; an empty day keeps the same slot as
 * a dashed outline.
 * Worn vs planned is the badge -- fill, not color.
 */
export function PlannerMonthGrid({ weeks, dayFits, thumbnailUrls, onOpenDay }: Props) {
  return (
    <View>
      <View testID="planner-month" style={{ rowGap: MONTH_ROW_GAP }}>
        {weeks.map((week, weekIndex) => (
          <View
            key={week.find((day) => day)?.date ?? weekIndex}
            className="flex-row"
            style={{ columnGap: MONTH_COLUMN_GAP }}
          >
            {week.map((day, index) => {
              if (!day) {
                return <View key={`blank-${index}`} className="flex-1" />;
              }
              const dayFit = dayFits.get(day.date);
              const coverPath = dayFit?.fit.cover_path;
              return (
                <MonthCell
                  key={day.date}
                  day={day}
                  dayFit={dayFit}
                  coverUrl={coverPath ? (thumbnailUrls?.[coverPath] ?? null) : null}
                  onPress={() => onOpenDay(day.date)}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View
        className="flex-row items-center gap-2 pt-5"
        accessible
        accessibilityLabel="A check marks a day the Fit was worn"
      >
        <WornBadge />
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          Worn
        </Text>
      </View>
    </View>
  );
}

/** The weekday letters over the grid, shared with the skeleton so both line up. */
export function MonthWeekdayHeader() {
  return (
    <View
      className="flex-row pb-2.5"
      style={{ columnGap: MONTH_COLUMN_GAP }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {MONTH_WEEKDAY_LETTERS.map((letter, index) => (
        <Text
          key={index}
          variant="caption"
          className="flex-1 text-center text-ink-secondary dark:text-ink-secondaryDark"
        >
          {letter}
        </Text>
      ))}
    </View>
  );
}
