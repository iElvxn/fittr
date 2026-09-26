import { View } from 'react-native';

import { MONTH_COLUMN_GAP, MONTH_ROW_GAP, MONTH_TILE_ASPECT_RATIO } from './PlannerMonthGrid';

/** A scattering of tile-shaped blocks, so the skeleton reads as a month of plans rather than a solid wall. */
const TILE_CELLS = new Set([1, 3, 8, 10, 15, 18, 22, 25, 29]);

/**
 * The month view's loading state (P4MonthLoading): date bars and a few tile
 * blocks on `surface-tile`, laid out like the real grid -- the month's own
 * 4 to 6 weeks, so nothing jumps when the data lands. Hidden from screen
 * readers, since it carries no content.
 */
export function PlannerMonthSkeleton({ weeks }: { weeks: number }) {
  return (
    <View
      testID="planner-month-skeleton"
      style={{ rowGap: MONTH_ROW_GAP }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: weeks }, (_, week) => (
        <View key={week} className="flex-row" style={{ columnGap: MONTH_COLUMN_GAP }}>
          {Array.from({ length: 7 }, (_, column) => (
            <View key={column} className="flex-1 items-center gap-1">
              <View
                style={{ width: 18, height: 14, marginTop: 3 }}
                className="rounded-sm bg-surface-tile dark:bg-surface-tileDark"
              />
              <View
                style={{ width: '100%', aspectRatio: MONTH_TILE_ASPECT_RATIO }}
                className={
                  TILE_CELLS.has(week * 7 + column) ? 'rounded-md bg-surface-tile dark:bg-surface-tileDark' : ''
                }
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
