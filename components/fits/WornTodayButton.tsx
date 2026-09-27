import { useColorScheme } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { colors } from '@/lib/theme/colors';

type Props = {
  isWornToday: boolean;
  /** A write is in flight: taps are ignored. */
  busy: boolean;
  onToggle: () => void;
};

/**
 * Mark worn / Worn today, shared by Home's card and the day sheet header.
 * Solid means done, like a checked box: an outlined "Mark worn" becomes a
 * solid ink "Worn today" with a check, which undoes the wear. Monochrome --
 * the state is fill plus glyph, never color.
 */
export function WornTodayButton({ isWornToday, busy, onToggle }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return isWornToday ? (
    <Button
      title="Worn today"
      variant="primary"
      accessibilityLabel="Worn today. Tap to undo"
      accessibilityState={{ selected: true, busy }}
      leftIcon={<CheckIcon size={15} color={palette.surfaceBase} />}
      onPress={busy ? undefined : onToggle}
    />
  ) : (
    <Button
      title="Mark worn"
      variant="secondary"
      accessibilityState={{ selected: false, busy }}
      onPress={busy ? undefined : onToggle}
    />
  );
}
