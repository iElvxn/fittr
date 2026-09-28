---
title: 'Story 6.4: Production Crash and Analytics Wiring'
type: 'chore'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
context: []
depends_on: ['6-3-one-shared-auth-session']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Crash reporting and analytics aren't ready for real users.
- `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD: "true"` on the **production** profile, and the Sentry plugin in `app.json` has no org or project. So no source maps upload, and production stack traces point at minified code.
- `tracesSampleRate: 1.0` traces every session, and with no navigation integration those traces aren't split per screen, so they say little.
- No crash is tied to a user.
- PostHog never calls `identify` or `reset`, so events are per install, not per user. That breaks the Phase 1 activation and retention funnels, which are the product's central question.
- Locally, `.env.local` still uses the unprefixed `SENTRY_DSN`/`POSTHOG_*` names while the code reads `EXPO_PUBLIC_*`, so both are off in local builds (Epic 1 retro item 1, still open).
- `expo-updates` isn't installed, although the Phase 1 stack (`_bmad-output/specs/spec-phase-1/stack.md`) lists EAS Update for JS-only fixes. Without it, every production fix waits on App Store review. It needs a native build, so it has to be in the build handed to the launch cohort.

**Approach:**
- Upload source maps from production builds.
- Sample traces in production, split per screen with Sentry's React Navigation integration.
- Install `expo-updates` with a `production` channel and a fingerprint `runtimeVersion`, and upload source maps for each `eas update` too.
- Identify the signed-in user to Sentry (id only) and PostHog (database id) from Story 6.3's single session provider, and reset both on sign-out.
- Close retro item 1 by fixing the env names and confirming one real event reaches each dashboard.

## Boundaries & Constraints

**Always:**
- The only identifier sent is the Supabase user id, with no email, name or username. Sentry's `sendDefaultPii` stays off.
- Identify happens once per sign-in and on cold start with a stored session. `reset()` (PostHog) and `setUser(null)` (Sentry) happen on sign-out, including a remote sign-out. Both hang off the provider's auth events, not individual screens.
- PostHog's `identify` merges the pre-login anonymous events (sign-up, onboarding) into the user. That merge is intended.
- `tracesSampleRate` is 1.0 in development and 0.2 in production builds, chosen from `__DEV__` or the build profile, not hard-coded twice.
- `SENTRY_AUTH_TOKEN` exists only as an EAS secret, never committed. Development and preview builds may keep auto-upload off; production must not.
- No-DSN and no-key builds stay safe no-ops, as today.
- `runtimeVersion` uses the `fingerprint` policy, so an update only reaches builds with the same native code. Updates go to the `production` channel only from a deliberate `eas update --channel production`, never from CI on merge.
- Every published update gets its source maps uploaded (`npx sentry-expo-upload-sourcemaps dist` after `eas update`), documented as one script, so update crashes symbolicate like build crashes.

**Never:** no automatic update publishing from CI, no session replay, no autocapture of text inputs, no change to the existing event names or properties, and no new analytics events.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Sign in | any method | PostHog `identify(userId)`; Sentry `setUser({ id: userId })` | N/A |
| Cold start signed in | stored session | same identify, once | N/A |
| Sign out / remote sign-out | `SIGNED_OUT` | PostHog `reset()`; Sentry `setUser(null)` | N/A |
| Account switch | sign out, sign in as another user | the second user's events never carry the first user's id | N/A |
| Production crash | EAS production build | Sentry shows the TypeScript file and line | N/A |
| JS fix after launch | `eas update --channel production` | installed production builds with a matching runtime get it on next launch | a failed update download keeps the embedded bundle |
| Update crash | error thrown in an OTA bundle | Sentry shows the TypeScript file and line | N/A |
| No keys configured | local build without env | no network calls; identify and reset are harmless no-ops | N/A |

</frozen-after-approval>

## Open Questions

- Sentry org and project slugs for the `@sentry/react-native/expo` plugin config -- options: give the slugs now (the spec records them in `app.json`) / read them from `SENTRY_ORG`/`SENTRY_PROJECT` EAS env vars (nothing org-specific committed).

## Code Map

- `eas.json` -- remove `SENTRY_DISABLE_AUTO_UPLOAD` from `production` (keep it on `development`/`preview` unless you want preview maps too).
- `app.json:57` -- the plugin is `"@sentry/react-native"` with no options. Use `["@sentry/react-native/expo", { organization, project, url }]` per Sentry's Expo guide.
- `lib/observability/sentry.ts` -- `tracesSampleRate` by environment. Add `Sentry.reactNavigationIntegration()` and register the Expo Router navigation container with it (`useNavigationContainerRef` in `app/_layout.tsx`). Export `identifySentryUser(id | null)`.
- `metro.config.js` -- uses `getDefaultConfig` from `expo/metro-config`. Switch to `getSentryExpoConfig(__dirname)` from `@sentry/react-native/metro` (present in 7.11), still wrapped by `withNativeWind`, so bundles get the debug IDs source maps are matched by.
- `package.json`, `app.json`, `eas.json` -- `npx expo install expo-updates`; `runtimeVersion: { policy: 'fingerprint' }` and `updates.url` (via `eas update:configure`); a `channel` on each build profile. Add an `update:production` npm script that runs `eas update --channel production` and then the Sentry upload.
- `lib/analytics/posthog.ts` -- export `identifyAnalyticsUser(id)` / `resetAnalyticsUser()`. Keep the placeholder-key `optOut` behavior.
- `lib/auth/useSession.ts` (Story 6.3's provider) -- call both on `INITIAL_SESSION` / `SIGNED_IN` with a user, and on `SIGNED_OUT`. Only when the user id changes, not on every `TOKEN_REFRESHED`.
- `.env.example` already uses the `EXPO_PUBLIC_*` names; no change. Only the developer's `.env.local` (`:21,24,25`) and the EAS environment variables need renaming. This story documents the step; the developer makes it.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark `epic-1-retro-item-1-...` done once one real event reaches each dashboard.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/sessionProvider.test.tsx` (extend), `__tests__/sentry.test.ts`, `__tests__/posthog.test.ts` -- identify on sign-in and cold start, once per user id; reset on sign-out; sample rate by environment; no-key no-op.
- [ ] `lib/observability/sentry.ts`, `lib/analytics/posthog.ts`, `lib/auth/useSession.ts` -- the wiring.
- [ ] `app.json`, `eas.json`, `metro.config.js`, `package.json` -- Sentry plugin and Metro config, `expo-updates`, channels, runtime version, update script.

**Acceptance Criteria:**
- Given an EAS production build with `SENTRY_AUTH_TOKEN` set, when a test error is thrown, then Sentry shows the original source file and line.
- Given a production build and a published `eas update`, when the app is relaunched, then it runs the update, and an error thrown from it shows the original source line in Sentry.
- Given a user who signs up, adds an item and makes a Fit, when PostHog is checked, then all those events belong to one person with the Supabase user id.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- EAS production (or a local release) build: trigger a test error and confirm the symbolicated stack. Sign in and out on one device with two accounts and confirm two separate PostHog persons. Publish a trivial update to a preview channel and confirm the build picks it up. Confirm NativeWind styles still build under `getSentryExpoConfig`.
