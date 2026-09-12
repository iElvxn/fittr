// Manual mock for `expo-font`.
//
// The real module's `FontLoader` imports `expo-asset`, which is only
// nested under `node_modules/expo/node_modules/expo-asset` in this
// project's dependency tree rather than hoisted — unreachable via Node's
// CommonJS resolution from `expo-font` itself, so any test that imports
// the app's font pipeline (`components/ui/Text.tsx` -> `lib/theme/fonts.ts`
// -> `@expo-google-fonts/*`) fails at import time. Placed in `__mocks__`
// adjacent to `node_modules` per Jest's docs, this is applied automatically
// to every test — no `jest.mock(...)` call needed per file. Screen-level
// tests don't need real font loading, just a `Text`/`Button` render that
// doesn't crash.

export function loadAsync(): Promise<void> {
  return Promise.resolve();
}

export function useFonts(): [boolean, Error | null] {
  return [true, null];
}

export function isLoaded(): boolean {
  return true;
}

export function isLoading(): boolean {
  return false;
}

export function getLoadedFonts(): string[] {
  return [];
}
