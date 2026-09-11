import {
  Cormorant_500Medium,
  Cormorant_600SemiBold,
} from '@expo-google-fonts/cormorant';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
} from '@expo-google-fonts/montserrat';

/** Passed to `useFonts` in the root layout. Keys are used as `fontFamily` values. */
export const appFonts = {
  Cormorant_600SemiBold,
  Cormorant_500Medium,
  Montserrat_400Regular,
  Montserrat_500Medium,
};

/** DESIGN.md's five type roles, mapped to the loaded font family + base size/line-height. */
export const typeScale = {
  display: { fontFamily: 'Cormorant_600SemiBold', fontSize: 34, lineHeight: 40 },
  title: { fontFamily: 'Cormorant_500Medium', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Montserrat_400Regular', fontSize: 16, lineHeight: 22 },
  label: { fontFamily: 'Montserrat_500Medium', fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: 'Montserrat_400Regular', fontSize: 13, lineHeight: 18 },
} as const;

export type TypeRole = keyof typeof typeScale;
