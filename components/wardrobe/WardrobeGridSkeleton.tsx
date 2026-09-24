import { View } from 'react-native';

type Props = {
  columns: number;
  cellSize: number;
  gap: number;
  rows?: number;
};

/** Matches the eventual grid's shape (per EXPERIENCE.md's "never a bare spinner" loading rule). */
export function WardrobeGridSkeleton({ columns, cellSize, gap, rows = 4 }: Props) {
  const cells = Array.from({ length: columns * rows });

  return (
    <View className="flex-row flex-wrap px-gutter" style={{ gap }} accessibilityElementsHidden importantForAccessibility="no">
      {cells.map((_, index) => (
        <View
          key={index}
          style={{ width: cellSize, height: cellSize }}
          className="rounded-lg bg-surface-raised dark:bg-surface-raisedDark"
        />
      ))}
    </View>
  );
}
