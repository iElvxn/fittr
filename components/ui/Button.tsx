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
 * Primary: solid ink fill, one per screen. Secondary: ink outline,
 * transparent fill — the treatment shared by all three Welcome sign-in
 * buttons (per DESIGN.md, hierarchy comes from fill-vs-outline, never color).
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
        'w-full flex-row items-center justify-center rounded-sm px-6 py-3',
        isPrimary
          ? 'bg-ink-primary dark:bg-ink-primaryDark'
          : 'border border-ink-primary bg-transparent dark:border-ink-primaryDark',
        isDisabled ? 'opacity-50' : '',
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? palette.surfaceRaised : palette.inkPrimary} />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text
            variant="body"
            className={[
              leftIcon ? 'ml-2' : '',
              isPrimary
                ? 'text-surface-raised dark:text-surface-baseDark'
                : 'text-ink-primary dark:text-ink-primaryDark',
            ].join(' ')}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
