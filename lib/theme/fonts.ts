import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
} from '@expo-google-fonts/montserrat';

/** Passed to `useFonts` in the root layout. Keys are used as `fontFamily` values. */
export const appFonts = {
  Fraunces_600SemiBold,
  Fraunces_500Medium,
  Montserrat_400Regular,
  Montserrat_500Medium,
};

/**
 * DESIGN.md's five type roles, mapped to the loaded font family + base
 * size/line-height. Fraunces (display/title) swapped in for Cormorant for a
 * more idiosyncratic, editorial-fashion display face — its optical-size wonk
 * gives it more character than a conventional garalde serif at large sizes.
 */
export const typeScale = {
  display: { fontFamily: 'Fraunces_600SemiBold', fontSize: 34, lineHeight: 40 },
  title: { fontFamily: 'Fraunces_500Medium', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Montserrat_400Regular', fontSize: 16, lineHeight: 22 },
  label: { fontFamily: 'Montserrat_500Medium', fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: 'Montserrat_400Regular', fontSize: 13, lineHeight: 18 },
} as const;

export type TypeRole = keyof typeof typeScale;
