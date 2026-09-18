import { Modal, Pressable, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { CANVAS_BACKGROUND_COLORS } from '@/lib/fitBuilder/backgroundColors';
import { colors } from '@/lib/theme/colors';

const SWATCH_SIZE = 44;

type Props = {
  visible: boolean;
  /** `null` is the theme's own default canvas surface, not one of the pastel swatches. */
  selectedColor: string | null;
  onSelect: (hex: string | null) => void;
  onClose: () => void;
};

type SwatchProps = {
  displayColor: string;
  label: string;
  selected: boolean;
  onPress: () => void;
};

function ColorSwatch({ displayColor, label, selected, onPress }: SwatchProps) {
  const scheme = useColorScheme();
  const selectedRingColor = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;
  const restingBorderColor = scheme === 'dark' ? colors.dark.borderHairline : colors.light.borderHairline;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: SWATCH_SIZE,
        height: SWATCH_SIZE,
        borderRadius: SWATCH_SIZE / 2,
        backgroundColor: displayColor,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? selectedRingColor : restingBorderColor,
      }}
    />
  );
}

/**
 * Compact bottom sheet for picking one of the curated pastel canvas
 * backdrops (see `lib/fitBuilder/backgroundColors.ts`). Content-height
 * rather than `CatalogSheet`'s near-full-height -- a row of swatches needs
 * far less room than a scrollable grid.
 */
export function CanvasBackgroundSheet({ visible, selectedColor, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();

  if (!visible) {
    return null;
  }

  const defaultSwatchColor = scheme === 'dark' ? colors.dark.surfaceRaised : colors.light.surfaceRaised;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="rounded-t-lg bg-surface-base px-gutter pt-2 dark:bg-surface-baseDark"
        >
          <View className="items-center pb-3 pt-2">
            <View className="h-1 w-9 rounded-full bg-border-hairline dark:bg-border-hairlineDark" />
          </View>
          <Text variant="title" className="mb-4 text-ink-primary dark:text-ink-primaryDark">
            Canvas background
          </Text>
          <View className="flex-row flex-wrap gap-3 pb-2">
            <ColorSwatch
              displayColor={defaultSwatchColor}
              label="Default"
              selected={selectedColor === null}
              onPress={() => onSelect(null)}
            />
            {CANVAS_BACKGROUND_COLORS.map((swatch) => (
              <ColorSwatch
                key={swatch.id}
                displayColor={swatch.hex}
                label={swatch.label}
                selected={selectedColor === swatch.hex}
                onPress={() => onSelect(swatch.hex)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
