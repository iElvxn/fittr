---
title: 'Story 6.4: Production Crash and Analytics Wiring'
type: 'chore'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
depends_on: ['6-3-one-shared-auth-session']
baseline_commit: '4c6f82e7f7619643cf01f367acbf00b064ecd8ef'
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

**Decisions:**
- No Sentry or PostHog account exists yet (2026-11-03). Build everything now; it runs keyless as a no-op. Org and project slugs are not committed. The Sentry plugin and upload script read `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` from EAS env vars and the developer's shell once the accounts exist. The real-dashboard checks and retro item 1 move to Story 6.11 (pre-launch verification).

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

## Code Map

- `eas.json` -- remove `SENTRY_DISABLE_AUTO_UPLOAD` from `production` only; keep it on `development`/`preview`. Add `"channel"` = `development` / `preview` / `production` to the matching profile.
- `app.json` -- plugin entry `"@sentry/react-native"` (last in `plugins`) becomes `["@sentry/react-native/expo", { "url": "https://sentry.io/" }]` with no org or project (package ships `expo.js`, v7.11.0). Until the account exists, production gets `SENTRY_ALLOW_FAILURE: "true"` in `eas.json` so a missing token fails the upload, not the build. Remove it once the EAS secrets are set (Story 6.11). Add `"runtimeVersion": { "policy": "fingerprint" }` and `"updates": { "url": "https://u.expo.dev/98601fda-12e4-444b-aeac-5683b0298186" }` (projectId from `extra.eas`; what `eas update:configure` would write).
- `metro.config.js` -- `getDefaultConfig` from `expo/metro-config` → `getSentryExpoConfig(__dirname)` from `@sentry/react-native/metro`; keep the `withNativeWind(config, { input: './global.css' })` wrap.
- `package.json` -- `npx expo install expo-updates` (not installed yet). Script `"update:production": "eas update --channel production --environment production && npx sentry-expo-upload-sourcemaps dist"`; `--environment production` makes the OTA bundle inline the EAS production env vars, not the developer's local `.env.local`.
- `lib/observability/sentry.ts` -- `initSentry()` now passes `tracesSampleRate: __DEV__ ? 1.0 : 0.2` and `integrations: [navigationIntegration]`, where `export const navigationIntegration = Sentry.reactNavigationIntegration()`. Add `identifySentryUser(id: string | null)` → `Sentry.setUser(id ? { id } : null)`. Keep the `enabled: Boolean(dsn)` no-op and the `Sentry` re-export.
- `app/_layout.tsx` -- in `RootLayout`, `const ref = useNavigationContainerRef()` (from `expo-router`) and `useEffect(() => { if (ref) navigationIntegration.registerNavigationContainer(ref); }, [ref])`. `initSentry()` stays at module top.
- `lib/analytics/posthog.ts` -- add `identifyAnalyticsUser(id)` → `posthog.identify(id)` and `resetAnalyticsUser()` → `posthog.reset()`. Keep the placeholder-key `optOut()`; existing `track*` functions unchanged.
- `lib/auth/useSession.tsx` -- inside the `onAuthStateChange` callback (outside the `setState` updater; side effects must not run in an updater), track the identified id in a `useRef<string | null>`. `SIGNED_OUT` → reset both, ref = null. Any event whose `session?.user.id` differs from the ref and is non-null → if ref was non-null, reset first; then identify both and store. Same id (`TOKEN_REFRESHED`, `USER_UPDATED`, and the cold-start `SIGNED_IN` → `INITIAL_SESSION` pair) → nothing. Keep the existing `queryClient.clear()` and `isNewUser` logic untouched.
- `__tests__/rootLayout.test.tsx` -- its `expo-router` mock needs `useNavigationContainerRef`, its sentry mock needs `navigationIntegration: { registerNavigationContainer: jest.fn() }`.
- `__tests__/sessionProvider.test.tsx` -- currently doesn't mock sentry/posthog; add `jest.mock` for both lib modules with the new functions.
- `.env.local` (developer-owned, keys `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`) and the EAS env vars -- the developer renames to `EXPO_PUBLIC_*`; not touched by the agent. `.env.example` is already correct.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:90` -- `epic-1-retro-item-1-fix-analytics-env-var-prefix` is `in-progress`; it stays open until 6.11, when there are real accounts to confirm an event in each dashboard.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/sessionProvider.test.tsx` -- extend: identify on `SIGNED_IN` and cold start (once across `SIGNED_IN`+`INITIAL_SESSION`), not again on `TOKEN_REFRESHED`; reset on `SIGNED_OUT`; account switch identifies the second id after a reset -- covers the I/O matrix.
- [x] `__tests__/sentry.test.ts`, `__tests__/posthog.test.ts` -- new: sample rate from `__DEV__`; no-DSN `enabled: false`; `identifySentryUser(null)` clears; posthog identify/reset delegate, placeholder key opts out.
- [x] `lib/observability/sentry.ts`, `lib/analytics/posthog.ts`, `lib/auth/useSession.tsx`, `app/_layout.tsx`, `__tests__/rootLayout.test.tsx` -- the runtime wiring per Code Map.
- [x] `app.json`, `eas.json`, `metro.config.js`, `package.json` -- Sentry Expo plugin and Metro config, `expo-updates`, channels, runtime version, `update:production` script.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- leave retro item 1 `in-progress`; add a note that its dashboard check moves to 6.11.

**Acceptance Criteria:**
- Given an EAS production build with `SENTRY_AUTH_TOKEN` set, when a test error is thrown, then Sentry shows the original source file and line.
- Given a production build and a published `eas update`, when the app is relaunched, then it runs the update, and an error thrown from it shows the original source line in Sentry.
- Given a user who signs up, adds an item and makes a Fit, when PostHog is checked, then all those events belong to one person with the Supabase user id.

## Implementation Notes

## Spec Change Log

- Iteration 0 review, triage #2 (bad_spec): `update:production` ran `eas update` without `--environment production`, so an OTA bundle would inline the developer's local env (today's unprefixed `.env.local` names) and ship with Sentry and PostHog off. Amended the `package.json` Code Map line to add the flag. Known-bad state avoided: a production update built from local env vars. KEEP: everything else from iteration 0 unchanged (the runtime wiring, tests and build config); applied as a scoped amendment with the user's agreement instead of a full revert and re-derive, which would reproduce identical code.

## Review Triage Log

Iteration 0 (blind-hunter, edge-case-hunter, verification-gap):

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| 1 | Keyless build: `reset()` on sign-out clears PostHog's persisted `OptedOut`, opting the placeholder client back in (edge-case, blind) | high | patch | `@posthog/core` `reset()` nulls every persisted key outside Queue/AiQueue/AiCaptureQueue/LogsQueue; `optedOut` then falls back to `!defaultOptIn` = false. Breaks matrix row "No keys configured → no network calls". |
| 2 | `update:production` runs `eas update` without `--environment production`, so OTA bundles inline the developer's local env, not EAS production vars (blind) | medium | bad_spec | eas-cli 16.17.3 supports `--environment`; without it `EXPO_PUBLIC_SENTRY_DSN`/`POSTHOG_*` come from the local shell/.env.local, so an update can ship with Sentry/PostHog off. Code Map dictates the script verbatim. |
| 3 | `registerNavigationContainer` call in `app/_layout.tsx` is never asserted (verification-gap, blind) | medium | patch | Pre-verified: deleting the effect leaves all suites green; per-screen tracing could silently regress. |
| 4 | `if (navigationRef)` guard in `app/_layout.tsx` is always true (blind, verification-gap) | low | patch | `useNavigationContainerRef()` always returns a ref object; direct deletion, folded into #3. |
| 5 | Sentry `environment` unset, so preview builds report as `production` (blind) | medium | defer | Pre-existing: `initSentry` never set `environment` before this change. |
| 6 | Opt-out is async, so an early identify could race it; stale `posthog.ts` comment (blind) | low | patch | Moot once #1 guards identify/reset on the key; the module comment naming only `trackSignedUp` as a no-op is corrected with it. |
| 7 | Production upload failures pass silently under `SENTRY_ALLOW_FAILURE`; org/project/token undocumented (blind) | false | reject | Spec Decisions chose this stopgap until accounts exist; Story 6.11 removes it. |
| 8 | Script has no `--message`, uploads maps after the update is live; no retry documented if upload fails (blind, edge-case) | low | reject | Manual, interactive script by design; re-running `npx sentry-expo-upload-sourcemaps dist` is the retry; unlikely before 6.11. |
| 9 | Non-`SIGNED_OUT` event with null session leaves identity attached (edge-case) | false | reject | auth-js only emits a null session on `SIGNED_OUT` and `INITIAL_SESSION`; at `INITIAL_SESSION` the ref is still null. |
| 10 | `SIGNED_OUT` with nothing identified still resets; no test (blind) | false | reject | Spec mandates reset on every `SIGNED_OUT`; harmless once #1 guards keyless builds. |
| 11 | Id change without `SIGNED_OUT` doesn't clear the Query cache (blind) | low | reject | Pre-existing 6.3 behavior; the app has no in-session account switch, so the path needs a missed `SIGNED_OUT`. |
| 12 | New native build needed; `checkAutomatically`/`fallbackToCacheTimeout` unset (blind) | false | reject | Intent already states it needs a native build; defaults (`ON_LOAD`, 0 ms) match the matrix row "gets it on next launch". |
| 13 | Review diff omits spec and lockfile; untracked ai-stylist folder (blind) | false | reject | Spec is the claims file by design; lockfile change is the `expo-updates` install; ai-stylist stays out of the commit. |
| 14 | Hand-written `last_updated`; retro item status unclear (blind) | false | reject | Sync rule updates `last_updated` in the file's existing format; spec Task 5 says keep the item `in-progress`. |

## Design Notes

Identity is keyed on user-id *change*, not on event names, because auth-js emits `SIGNED_IN` before `INITIAL_SESSION` on cold start and re-emits `SIGNED_IN` on tab refocus-style recoveries; the ref makes both "once". A missed `SIGNED_OUT` between two users is still covered by the reset-before-identify on id change.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.
- `npx expo config --type public` -- expected: resolves with the Sentry plugin, `runtimeVersion`, and `updates.url`.

**Manual checks:**
- EAS production (or a local release) build: trigger a test error and confirm the symbolicated stack. Sign in and out on one device with two accounts and confirm two separate PostHog persons. Publish a trivial update to the `preview` channel and confirm a preview build picks it up. Confirm NativeWind styles still build under `getSentryExpoConfig`.
