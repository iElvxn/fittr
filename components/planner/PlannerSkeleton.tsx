import { View } from 'react-native';

import { DAY_LABEL_WIDTH, DAY_ROW_MIN_HEIGHT, DAY_TILE_HEIGHT, DAY_TILE_WIDTH } from './PlannerDayRow';

const ROWS = 5;

/**
 * The Planner's loading state: hairline-separated rows shaped like the real
 * day rows -- caption and date bars, a tile, two text bars -- on
 * `surface-tile` (EXPERIENCE.md's "never a bare spinner" rule). Hidden from
 * screen readers, since it carries no content.
 */
export function PlannerSkeleton() {
  return (
    <View
      testID="planner-skeleton"
      className="px-gutter pt-5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: ROWS }, (_, row) => (
        <View
          key={row}
          style={{ height: DAY_ROW_MIN_HEIGHT }}
          className="flex-row items-center gap-3.5 border-t border-border-hairline dark:border-border-hairlineDark"
        >
          <View style={{ width: DAY_LABEL_WIDTH }} className="gap-1.5">
            <View style={{ width: 30, height: 10 }} className="rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
            <View style={{ width: 34, height: 24 }} className="rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
          </View>
          <View
            style={{ width: DAY_TILE_WIDTH, height: DAY_TILE_HEIGHT }}
            className="rounded-lg bg-surface-tile dark:bg-surface-tileDark"
          />
          <View className="flex-1 gap-2">
            <View style={{ width: '70%', height: 14 }} className="rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
            <View style={{ width: '40%', height: 8 }} className="rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
          </View>
        </View>
      ))}
    </View>
  );
}
