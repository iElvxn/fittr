import { ActivityIndicator, Pressable, type PressableProps, useColorScheme } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

type Props = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  leftIcon?: React.ReactNode;
};

/**
 * Primary: solid accent (oxblood) fill, white text, one per screen.
 * Secondary: ink outline, transparent fill. Accent is the one deliberate
 * color exception to DESIGN.md's monochrome rule -- it never appears
 * outside the primary button and the item name's single display moment,
 * so hierarchy still reads primarily from fill-vs-outline, not color alone.
 */
export function Button({ title, variant = 'secondary', loading, leftIcon, disabled, ...props }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const isPrimary = variant === 'primary';
  const isDisabled = Boolean(disabled) || Boolean(loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={[
        'flex-row items-center justify-center rounded-sm px-6 py-3',
        isPrimary
          ? 'bg-accent dark:bg-accentDark'
          : 'border border-ink-primary bg-transparent dark:border-ink-primaryDark',
        isDisabled ? 'opacity-50' : '',
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.light.surfaceRaised : palette.inkPrimary} />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text
            variant="body"
            className={[
              leftIcon ? 'ml-2' : '',
              isPrimary ? 'text-surface-raised' : 'text-ink-primary dark:text-ink-primaryDark',
            ].join(' ')}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
