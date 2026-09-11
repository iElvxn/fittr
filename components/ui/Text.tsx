import { Text as RNText, type TextProps, PixelRatio } from 'react-native';

import { typeScale, type TypeRole } from '@/lib/theme/fonts';

type Props = TextProps & {
  variant?: TypeRole;
  className?: string;
};

/**
 * Cormorant/Montserrat are custom fonts, so they don't ride iOS Dynamic
 * Type's automatic scaling the way system fonts do — this multiplies the
 * base size by the user's font-scale setting explicitly, per the
 * Accessibility Floor in EXPERIENCE.md.
 */
export function Text({ variant = 'body', style, className, ...props }: Props) {
  const { fontFamily, fontSize, lineHeight } = typeScale[variant];
  const scale = PixelRatio.getFontScale();

  return (
    <RNText
      className={className}
      allowFontScaling={false}
      style={[
        {
          fontFamily,
          fontSize: fontSize * scale,
          lineHeight: lineHeight * scale,
        },
        style,
      ]}
      {...props}
    />
  );
}
