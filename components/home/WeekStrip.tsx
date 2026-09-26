import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import type { FitRow } from '@/lib/fits/listFits';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import type { WeekDay } from '@/lib/planner/week';

export const WEEK_TILE_HEIGHT = 62;
const TODAY_BORDER_WIDTH = 1.5;

type Props = {
  days: WeekDay[];
  planByDate: Map<string, FitRow>;
  thumbnailUrls: ThumbnailUrlMap | undefined;
  onOpenPlanner: () => void;
};

function tileClassName(fit: FitRow | null, isToday: boolean) {
  if (!fit) {
    return isToday
      ? 'rounded-md border border-dashed border-ink-primary dark:border-ink-primaryDark'
      : 'rounded-md border border-dashed border-ink-disabled dark:border-ink-disabledDark';
  }
  return [
    'overflow-hidden rounded-md',
    fit.canvas_background_color ? '' : 'bg-surface-raised dark:bg-surface-raisedDark',
    isToday ? 'border-ink-primary dark:border-ink-primaryDark' : '',
  ].join(' ');
}

/**
 * Home's glance at the current week: seven mini tiles, Monday to Sunday,
 * filled like the Planner's for a planned day or a dashed slot for an
 * empty one. Today is marked by an ink border and label. Read-only -- the
 * tiles are not buttons; the "Planner" link is the way in.
 */
export function WeekStrip({ days, planByDate, thumbnailUrls, onOpenPlanner }: Props) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          This week
        </Text>
        <Pressable accessibilityRole="link" onPress={onOpenPlanner} hitSlop={12} className="py-3 active:opacity-60">
          <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
            Planner
          </Text>
        </Pressable>
      </View>
      <View testID="home-week" className="flex-row gap-1.5">
        {days.map((day) => {
          const fit = planByDate.get(day.date) ?? null;
          const coverUrl = fit?.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;
          return (
            <View
              key={day.date}
              accessible
              accessibilityLabel={`${day.long}: ${fit ? fit.name : 'nothing planned'}`}
              className="flex-1 items-center gap-1.5"
            >
              <View
                testID={`home-week-tile-${day.date}`}
                style={[
                  { width: '100%', height: WEEK_TILE_HEIGHT },
                  fit?.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
                  fit && day.isToday ? { borderWidth: TODAY_BORDER_WIDTH } : null,
                ]}
                className={tileClassName(fit, day.isToday)}
              >
                {coverUrl ? (
                  <Image accessibilityLabel="" source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                ) : null}
              </View>
              <Text
                testID={`home-week-label-${day.date}`}
                variant="caption"
                className={day.isToday ? 'text-ink-primary dark:text-ink-primaryDark' : 'text-ink-secondary dark:text-ink-secondaryDark'}
              >
                {day.dow.charAt(0)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
