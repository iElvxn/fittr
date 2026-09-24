import { View } from 'react-native';

// Per-column tile heights as a fraction of column width -- uneven on
// purpose so the placeholder reads as the masonry it's standing in for.
const COLUMN_SHAPES = [
  [1.9, 1.3, 1.55, 1.4],
  [1.55, 1.75, 1.15, 1.65],
  [1.4, 1.65, 1.25, 1.8],
];

type Props = {
  columns: number;
  columnWidth: number;
  columnGap: number;
  rowGap: number;
};

/**
 * My Closet's loading state: a 3-column masonry of `surface-tile` photo
 * wells, each with two short text bars under it, matching the real grid's
 * shape (per EXPERIENCE.md's "never a bare spinner" loading rule). Hidden
 * from screen readers -- it carries no content.
 */
export function WardrobeGridSkeleton({ columns, columnWidth, columnGap, rowGap }: Props) {
  return (
    <View
      testID="wardrobe-grid-skeleton"
      className="flex-row px-gutter pt-5"
      style={{ gap: columnGap }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: columns }, (_, column) => (
        <View key={column} style={{ width: columnWidth, gap: rowGap }}>
          {COLUMN_SHAPES[column % COLUMN_SHAPES.length].map((ratio, index) => (
            <View key={index}>
              <View
                style={{ width: columnWidth, height: columnWidth * ratio }}
                className="rounded-lg bg-surface-tile dark:bg-surface-tileDark"
              />
              <View
                style={{ width: columnWidth * 0.7, height: 10 }}
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
