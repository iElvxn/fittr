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

const SWATCH_TARGET = 44;
const SWATCH_SIZE = 30;
/** The selected ring: a 2pt gap of the surface, then a 1.5pt ink ring. */
const RING_GAP = 2;
const RING_WIDTH = 1.5;
const RING_SIZE = SWATCH_SIZE + (RING_GAP + RING_WIDTH) * 2;

/**
 * Swatch row shared by the batch-review editor and the item-detail edit
 * form. Each swatch is a 30pt dot inside a 44pt touch target; the selected
 * one gets a two-ring treatment (surface gap, then an ink ring) -- state by
 * shape, never color. The hairline edge keeps White visible on cream.
 */
export function ColorSwatchPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {COLOR_SWATCHES.map(({ hex, name }) => {
        const selected = hex.toLowerCase() === value?.toLowerCase();
        return (
          <Pressable
            key={hex}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            onPress={() => onChange(hex)}
            className="items-center justify-center"
            style={{ width: SWATCH_TARGET, height: SWATCH_TARGET }}
          >
            <View
              testID={selected ? 'color-swatch-ring' : undefined}
              className={[
                'items-center justify-center rounded-full',
                selected ? 'border-ink-primary dark:border-ink-primaryDark' : 'border-transparent',
              ].join(' ')}
              style={{ width: RING_SIZE, height: RING_SIZE, borderWidth: RING_WIDTH }}
            >
              <View
                className="rounded-full border border-border-hairline dark:border-border-hairlineDark"
                style={{ width: SWATCH_SIZE, height: SWATCH_SIZE, backgroundColor: hex }}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
