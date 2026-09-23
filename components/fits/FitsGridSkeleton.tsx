import { View } from 'react-native';

type Props = {
  columns: number;
  columnWidth: number;
  gap: number;
  rows?: number;
};

/** Fits-scoped counterpart to `components/wardrobe/WardrobeGridSkeleton.tsx` (EXPERIENCE.md's "never a bare spinner" rule). */
export function FitsGridSkeleton({ columns, columnWidth, gap, rows = 3 }: Props) {
  const cells = Array.from({ length: columns * rows });

  return (
    <View
      testID="fits-grid-skeleton"
      className="flex-row flex-wrap px-gutter pt-4"
      style={{ gap }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {cells.map((_, index) => (
        <View
          key={index}
          style={{ width: columnWidth, height: columnWidth * 1.3 }}
          className="rounded-lg bg-surface-raised dark:bg-surface-raisedDark"
        />
      ))}
    </View>
  );
}
