# Platform and stack

| Layer | Choice |
|---|---|
| App | Expo SDK (latest stable), React Native, TypeScript strict, Expo Router |
| Minimum iOS | 17.0 (required by on-device subject lifting) |
| Server data | Supabase Postgres, row-level security, SQL migrations in `supabase/migrations`; no local database — the app reads and writes Supabase directly (see SPEC.md constraints) |
| Auth | Supabase Auth: Sign in with Apple, Google, and email/password — Apple and Google both via native `signInWithIdToken` (server-side token verification, no custom trust boundary); session persisted via an encrypted-`AsyncStorage` adapter with its AES key in `expo-secure-store` (a bare secure-store value can't hold a full session) |
| Images | On-device background removal via a Vision-backed React Native module; expo-image-manipulator for resizing; Supabase Storage behind an `ImageStore` interface |
| State | TanStack Query directly against Supabase (network reads/writes, no local cache-of-record); Zustand for UI and Fit-builder session state |
| Canvas | react-native-gesture-handler and react-native-reanimated for drag, pinch, and rotate; react-native-view-shot to export the arranged canvas as an image |
| Styling | NativeWind |
| Testing | Jest with jest-expo; React Native Testing Library; Maestro for three end-to-end flows before launch |
| CI and delivery | GitHub Actions (lint, typecheck, test on every PR); EAS Build and Submit; EAS Update for JS-only fixes |
| Observability | Sentry (crashes), PostHog (product events) |
