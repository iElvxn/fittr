---
title: 'Story 6.3: One Shared Auth Session'
type: 'refactor'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `useSession()` runs in 12 places. Each mount calls `getSession()`, which reads SecureStore and AES-decrypts the session, adds its own auth listener, and starts with `session: null, loading: true`. So every screen that opens shows a spinner or skeleton for a moment. Supabase's token auto-refresh also runs a timer the whole time the app is in the background, which Supabase advises against on React Native. The first requests after a long background can go out with an expired token.

**Approach:** One `SessionProvider` at the root holds the session. `useSession()` keeps its signature but reads that context, so every screen after the first has the session at once. The splash screen stays up until the first session read lands. Routing uses Expo Router's `Stack.Protected` guards instead of per-screen redirects. Auto-refresh follows the foreground: `startAutoRefresh` on `active`, `stopAutoRefresh` otherwise, registered once.

## Boundaries & Constraints

**Always:**
- `useSession(): { session, loading }` keeps its exact shape, so every existing caller and every test's `jest.mock('@/lib/auth/useSession')` keeps working.
- The provider subscribes with `onAuthStateChange` alone (it emits `INITIAL_SESSION` first) and never awaits another Supabase call inside that callback. Supabase warns this can deadlock the auth lock, so any follow-up work is deferred.
- Signed-out users can't reach any authenticated route, including by deep link, and a session that ends while the app is open (sign-out, expiry, remote revoke) lands on Welcome, as `app/(tabs)/_layout.tsx` does today.
- Signing out also clears the React Query cache, so the next user never sees the previous user's cached rows.
- Onboarding routing is unchanged: a new account still goes through `onboarding`, and a returning session goes to `(tabs)`.
- The new-account decision moves into the provider. On the `SIGNED_IN` event it records `isNewUser = isNewAccount(session.user)` (the existing `lib/auth/isNewAccount.ts`, which reads `created_at`/`last_sign_in_at` off the user the event already carries). When the `(auth)` guard flips, the first available screen (`index`) sends a new user to `onboarding` and anyone else to `(tabs)`. `welcome.tsx`, `sign-in.tsx` and `email-sign-up.tsx` stop calling `router.replace` after a successful sign-in, so there is one router decision, not two racing ones.
- The AppState auto-refresh listener is registered exactly once, at module or provider level, never per screen.

**Never:** no change to the session storage adapter (`LargeSecureStore`), the sign-in methods, or the onboarding flag logic (Epic 1 retro item 2 stays separate). No global state library just for this.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Cold start, signed in | stored session | splash until the session is read, then Home with no spinner flash | N/A |
| Cold start, signed out | none | splash, then Welcome | N/A |
| Open a screen | already signed in | `useSession()` returns the session on first render; no loading state | N/A |
| New sign-up (Apple, Google or email) | first sign-in of a new account | straight to `onboarding`, with no Home flash in between | N/A |
| Returning sign-in | existing account | straight to `(tabs)`, never `onboarding` | N/A |
| Sign out | from Profile | Welcome; authenticated routes unreachable; Query cache cleared | existing sign-out error handling |
| Session ends remotely | refresh fails while a tab is open | Welcome | N/A |
| Deep link while signed out | `fittr://fit/abc` | Welcome, not the Fit screen | N/A |
| Background / resume | app backgrounded, then active | refresh stops in the background and restarts on resume before queries run | N/A |

</frozen-after-approval>

## Code Map

- `lib/auth/useSession.ts` -- today's per-mount hook. Turn it into `SessionProvider` + context and keep `useSession` as the reader.
- `app/_layout.tsx` -- root. Wrap in `SessionProvider` (inside `QueryClientProvider`, so sign-out can clear the cache), keep the splash up until fonts **and** the session are ready (it already holds the splash for fonts), and add `Stack.Protected` groups: `(auth)` guarded by `!session`; `(tabs)`, `onboarding`, `add-item`, `new-fit`, `item/[id]`, `fit/[id]` and `profile` guarded by `session`.
- `app/index.tsx`, `app/(tabs)/_layout.tsx:44-60` -- today's loading spinners and redirects. Remove what the guards replace. `index` becomes the single place that chooses `onboarding` (provider's `isNewUser`) or `(tabs)`.
- `app/(auth)/welcome.tsx:28,49`, `app/(auth)/sign-in.tsx`, `app/(auth)/email-sign-up.tsx:35` -- today each does `router.replace(result.isNewUser ? '/onboarding' : '/(tabs)')` (or straight to `/onboarding`) after sign-in. Remove those calls; the guard flip plus `index` does the routing. The sign-in helpers' `isNewUser` return value can stay for analytics.
- `lib/auth/isNewAccount.ts` -- reused unchanged by the provider.
- `lib/supabase.ts` -- add the once-only AppState `startAutoRefresh`/`stopAutoRefresh` listener beside the client (Supabase's documented React Native pattern).
- The 12 callers of `useSession()` (`app/index.tsx`, `app/(tabs)/_layout.tsx`, the four tab screens in `app/(tabs)/`, `app/add-item.tsx`, `app/fit/[id].tsx`, `app/item/[id].tsx`, `app/new-fit.tsx`, `app/onboarding.tsx`, `app/profile.tsx`) keep calling it unchanged; only `index` and the tabs layout lose their redirect logic.
- Where sign-out happens (grep `auth.signOut`) -- clear the Query cache there or on the provider's `SIGNED_OUT` event (prefer the event, so a remote sign-out clears it too).

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/sessionProvider.test.tsx`, `__tests__/supabaseAutoRefresh.test.ts`, and routing tests where they exist -- one subscription however many readers; `loading` only before `INITIAL_SESSION`; cache cleared on `SIGNED_OUT`; start/stop on AppState; guards per the matrix.
- [ ] `lib/auth/useSession.ts` (provider + hook), `lib/supabase.ts` -- the shared session and the refresh listener.
- [ ] `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx` -- provider, splash, guards.
- [ ] `app/(auth)/welcome.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/email-sign-up.tsx` (+ `welcomeRouting`, `signInScreen`, `returningUser` tests) -- drop the post-sign-in `router.replace`; tests assert the new-user and returning-user destinations through `index`.

**Acceptance Criteria:**
- Given the app, when `grep -rn "onAuthStateChange\|getSession" app lib` is run, then only the provider (and sign-in helpers that need it) remain.
- Given a signed-in user switching between tabs and opening Fit and Item detail, when each screen mounts, then none shows a session-loading state.

## Design Notes

- **Overlap with open Epic 1 retro items.** Guarding `onboarding` with `session` closes the session-guard half of retro item 2 (the check-your-email state for unconfirmed email sign-ups stays open). Moving sign-out cleanup onto the `SIGNED_OUT` event touches retro item 4 (what happens when `signOut()` errors): this story does not decide it, but mark item 4 as affected so it isn't built against the old code.
- **Why derive `isNewUser` in the provider:** with `Stack.Protected`, the router moves off `(auth)` the moment the session appears, which is before the sign-in handler gets its result back. A second `router.replace` from the handler would race it. The user object on `SIGNED_IN` already carries both timestamps `isNewAccount` needs.
- Keeping `useSession` as the public API makes this a drop-in change. The only behavior change is that `loading` is true once per app launch, not once per screen.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: cold start signed in and signed out, sign out from Profile, open a `fittr://` deep link while signed out, and background the app for more than an hour, then resume and pull data.
