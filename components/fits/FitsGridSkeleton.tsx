import { View } from 'react-native';

import { TILE_HEIGHT_RATIO } from '@/components/fits/FitsGridCell';

type Props = {
  columns: number;
  columnWidth: number;
  columnGap: number;
  rowGap: number;
  rows?: number;
};

/**
 * My Fits' loading state: uniform 3:4 `surface-tile` wells, each with two
 * short text bars under it, matching the real grid's shape (EXPERIENCE.md's
 * "never a bare spinner" rule). Hidden from screen readers -- it carries no
 * content.
 */
export function FitsGridSkeleton({ columns, columnWidth, columnGap, rowGap, rows = 3 }: Props) {
  return (
    <View
      testID="fits-grid-skeleton"
      className="px-gutter pt-5"
      style={{ gap: rowGap }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} className="flex-row" style={{ gap: columnGap }}>
          {Array.from({ length: columns }, (__, column) => (
            <View key={column} style={{ width: columnWidth }}>
              <View
                testID="fits-grid-skeleton-tile"
                style={{ width: columnWidth, height: columnWidth * TILE_HEIGHT_RATIO }}
                className="rounded-lg bg-surface-tile dark:bg-surface-tileDark"
              />
              <View
                style={{ width: columnWidth * 0.7, height: 12 }}
                className="mt-2 rounded-sm bg-surface-tile dark:bg-surface-tileDark"
              />
              <View
                style={{ width: columnWidth * 0.4, height: 8 }}
                className="mt-1.5 rounded-sm bg-surface-tile dark:bg-surface-tileDark"
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
