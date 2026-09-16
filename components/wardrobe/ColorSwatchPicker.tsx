import { Pressable, View } from 'react-native';

/**
 * A small curated palette, not a full color picker -- matches Story 2.1's
 * "color swatches" wording. Each swatch carries a human-readable name for
 * its accessibility label -- without one, a screen reader would read the
 * raw hex digits aloud.
 */
export const COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#0C0A09', name: 'Black' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#78716C', name: 'Gray' },
  { hex: '#1E3A8A', name: 'Navy' },
  { hex: '#DBEAFE', name: 'Light blue' },
  { hex: '#78350F', name: 'Brown' },
  { hex: '#D6D3D1', name: 'Beige' },
  { hex: '#7F1D1D', name: 'Red' },
  { hex: '#EA580C', name: 'Orange' },
  { hex: '#CA8A04', name: 'Yellow' },
  { hex: '#166534', name: 'Green' },
  { hex: '#4C1D95', name: 'Purple' },
  { hex: '#DB2777', name: 'Pink' },
];

/** Human-readable name for a swatch hex, for editorial display copy -- falls back to the raw hex for a custom color outside the curated palette. */
export function colorLabel(hex: string | null): string | null {
  if (!hex) {
    return null;
  }
  const match = COLOR_SWATCHES.find((swatch) => swatch.hex.toLowerCase() === hex.toLowerCase());
  return match?.name ?? hex;
}

type Props = {
  value: string | null;
  onChange: (hex: string) => void;
};

/** Swatch row shared by the batch-review editor and the item-detail edit form. */
export function ColorSwatchPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {COLOR_SWATCHES.map(({ hex, name }) => {
        const selected = hex.toLowerCase() === value?.toLowerCase();
        return (
          <Pressable
            key={hex}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            onPress={() => onChange(hex)}
            hitSlop={8}
            className={[
              'h-9 w-9 rounded-full border',
              selected
                ? 'border-2 border-ink-primary dark:border-ink-primaryDark'
                : 'border-border-hairline dark:border-border-hairlineDark',
            ].join(' ')}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </View>
  );
}
