---
title: 'Story 6.3: One Shared Auth Session'
type: 'refactor'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
baseline_commit: 'b2035721fa92cc23735108a3a3ecb76fdce15665'
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

- `lib/auth/useSession.ts` -- today a per-mount `getSession()` + `onAuthStateChange`. Becomes `SessionProvider` (one `onAuthStateChange` subscription; `loading` true until `INITIAL_SESSION`; `isNewUser` set from `isNewAccount(session.user)` on `SIGNED_IN`, reset on `SIGNED_OUT`; `useQueryClient().clear()` on `SIGNED_OUT`), `useSession()` (unchanged `{ session, loading }`), and a new `useIsNewUser()` reader. Rename to `.tsx` only if JSX is needed; keep the import path `@/lib/auth/useSession`.
- `lib/supabase.ts` -- keep `LargeSecureStore` and client options untouched. Append the module-level `AppState.addEventListener('change', …)` → `supabase.auth.startAutoRefresh()` on `'active'`, `stopAutoRefresh()` otherwise.
- `app/_layout.tsx` -- `RootLayout` currently returns `null` until fonts load and hides the splash. Mount `SessionProvider` inside `QueryClientProvider` unconditionally; move the `<Stack>` into an inner navigator that renders `null` (splash held) until fonts are ready **and** `!loading`, then hides the splash. Not rendering the Stack while loading preserves a signed-in cold-start deep link, which guards evaluated against a still-null session would otherwise reject.
- `components/navigation/RootStack.tsx` (new) -- the `<Stack>` with `index` unguarded and first, `Stack.Protected guard={!session}` around `(auth)`, `Stack.Protected guard={!!session}` around `onboarding`, `(tabs)`, `add-item` (modal), `new-fit` (fullScreenModal), `item/[id]`, `fit/[id]`, `profile`. Lives outside `app/` so it isn't a route and can be rendered by `expo-router/testing-library`'s `renderRouter` (available in `node_modules`, unused so far).
- `app/index.tsx` -- drop the spinner (return `null` while loading); `Redirect` to `/(auth)/welcome` without a session, else `/onboarding` when `useIsNewUser()`, else `/(tabs)`.
- `app/(tabs)/_layout.tsx:44-60` -- remove the `loading` spinner and `!session` `Redirect` plus the now-unused `ActivityIndicator`/`View`/`Redirect`/`useSession` imports. Keep `router` (tab press).
- `app/(auth)/welcome.tsx:28,49`, `app/(auth)/sign-in.tsx:31`, `app/(auth)/email-sign-up.tsx:35` -- remove the success `router.replace`. Drop `router` imports only where nothing else uses them (`welcome` still pushes to email sign-up). Update the "we leave the screen entirely" comments.
- `app/profile.tsx:111-114` -- `handleSignOut` also `router.replace`s after `signOut()`; remove it for the same one-decision reason (the guard unmounts Profile). Error handling stays as is (retro item 4).
- `lib/auth/isNewAccount.ts`, sign-in helpers (`appleSignIn`, `googleSignIn`, `emailSignIn`, `emailSignUp`) -- unchanged.
- Not touched: the 10 other `useSession()` callers; `app/onboarding.tsx` (its `router.replace('/(tabs)')` is between two session-guarded routes, so there's no race).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/sessionProvider.test.tsx` -- mock `@/lib/supabase` with a controllable `onAuthStateChange`; assert one subscription for several readers, `loading` true only before `INITIAL_SESSION`, `isNewUser` from `SIGNED_IN`, cache cleared and `isNewUser` reset on `SIGNED_OUT`, no `getSession` call.
- [x] `__tests__/supabaseAutoRefresh.test.ts` -- mock `@supabase/supabase-js`'s `createClient`; assert one AppState listener, start on `active`, stop on `background`/`inactive`.
- [x] `__tests__/rootStack.test.tsx` -- `renderRouter` with `RootStack` as `_layout` and stub screens plus the real `app/index`; mock `useSession`/`useIsNewUser`. Cover: signed-out `/fit/abc` → welcome; signed-in `/` → tabs; new user `/` → onboarding; session flipping to null → welcome.
- [x] `lib/auth/useSession.ts`, `lib/supabase.ts` -- provider, readers, refresh listener.
- [x] `components/navigation/RootStack.tsx`, `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx` -- guards, splash, single routing decision.
- [x] `app/(auth)/welcome.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/email-sign-up.tsx`, `app/profile.tsx` + `__tests__/welcomeRouting.test.tsx`, `signInScreen.test.tsx`, `profileSignOut.test.tsx` -- drop post-auth navigation; tests assert the screens no longer navigate (destinations covered by `rootStack.test.tsx`). `returningUser.test.ts` stays as is.

**Acceptance Criteria:**
- Given the app, when `grep -rn "onAuthStateChange\|getSession" app lib` is run, then only `lib/auth/useSession.ts` matches.
- Given a signed-in user switching between tabs and opening Fit and Item detail, when each screen mounts, then none shows a session-loading state.
- Given the full suite, when tests run, then every existing `jest.mock('@/lib/auth/useSession', …)` suite passes unchanged.

## Implementation Notes

- Implemented directly in three reviewed batches (provider + refresh listener; guards + splash + `index`; sign-in/sign-out screens), per the user's one-task-at-a-time preference, rather than through one whole-spec subagent.
- `lib/auth/useSession.ts` → `useSession.tsx` (JSX). `useSession()` throws outside `SessionProvider`; every existing suite mocks the module, so none needed changes.
- `RootNavigator` (splash hold) lives beside `RootStack` in `components/navigation/RootStack.tsx` rather than in `app/_layout.tsx`, so `__tests__/rootNavigator.test.tsx` can cover the matrix's splash rows without loading Sentry/PostHog/fonts. `app/_layout.tsx` only mounts the providers.
- Surprise: Jest resolves `@/app/index` to `app.json`; `rootStack.test.tsx` imports `../app/index` with a comment. Other `@/app/...` paths are unaffected.
- `renderRouter` handles `Stack.Protected` fine. Mutation check: forcing the signed-in guard on failed 3 of 7 routing tests (deep link, new sign-up, session end), then restored.
- Retro item 4 note appended to `deferred-work.md`, per Design Notes.
- Verification: `npx jest --maxWorkers=2` → 76 suites passed, 1 skipped (RLS, needs `.env.local`), 1029 tests; `tsc --noEmit` and `expo lint` clean. Device checks not yet run.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Cold-start recovery `SIGNED_IN` (before `INITIAL_SESSION`) recomputes `isNewUser`; recent accounts go to onboarding on every launch (edge ×2, blind) | high | auth-js `_recoverAndRefresh` emits `SIGNED_IN` for a stored valid session inside `_initialize`; `INITIAL_SESSION` waits on `initializePromise`. | patch -- `isNewUser` only for `SIGNED_IN` after settle from signed-out; tests added |
| 2 | `loading` goes false on the recovery event, not `INITIAL_SESSION` (edge) | medium | Same root cause as #1. | patch, with #1 |
| 3 | `RootLayout` wiring (provider order, `fontsReady`) untested (verification-gap) | medium | No test rendered `app/_layout`. | patch -- `rootLayout.test.tsx`; both cited mutations now fail it |
| 4 | Email sign-up screen has no non-navigation test (verification-gap) | low | No test rendered the screen. | patch -- `emailSignUpScreen.test.tsx` |
| 5 | No test for signed-in deep link to `/sign-in` (blind) | low | Not covered. | patch -- one `rootStack` test |
| 6 | Cold-start `INITIAL_SESSION` new-user case unpinned; token-refresh test skips `INITIAL_SESSION` (blind) | low | Tests read as described. | patch, with #1 |
| 7 | Email `signUp` user may not satisfy `isNewAccount` live (verification-gap) | maybe-false | Can't settle in Jest; `isNewAccount` returns true on null `last_sign_in_at`. Needs a device sign-up. | defer (medium, unverified) |
| 8 | `isNewUser` not cleared after onboarding (edge, blind) | low | Only a root `fittr://` link re-enters `index` mid-session; fix adds provider API. | reject |
| 9 | Confirm-email sign-up now silent (edge, blind) | low | Intent's Never excludes retro item 2; already tracked. | reject (out of scope by intent) |
| 10 | Failed sign-out gives no feedback (edge, blind) | false | auth-js `_signOut` removes the local session on API/network errors, so `SIGNED_OUT` still fires; the storage-error path is retro item 4 (logged). | reject |
| 11 | No splash timeout if the first auth event never comes (edge, blind) | low | Pre-existing: a hung storage read already meant an endless spinner. | reject |
| 12 | Signed-out deep-link target not restored after sign-in (edge, blind) | low | New feature; matrix only requires Welcome. | reject |
| 13 | AppState `unknown` stops refresh; Fast Refresh duplicates the listener (blind) | false / low | `unknown` is never a change event, and auth-js starts refresh at init in non-browser; dev-only duplicates are idempotent. | reject |
| 14 | `SIGNED_IN` for another user without `SIGNED_OUT` keeps the cache (edge) | false | `(auth)` is unreachable while signed in. | reject |
| 15 | Welcome's after-sign-in helper work runs once the screen is gone (blind) | false | `applyProviderDisplayName` never throws. | reject |
| 16 | Helpers' `isNewUser` result now unused (blind) | low | Spec keeps it deliberately. | reject |
| 17 | No test for `TOKEN_REFRESHED` on a guarded screen (blind) | low | Guard reads only `session` truthiness. | reject |
| 18 | `index` loading branch unexecuted by `rootStack` tests (blind) | low | Fallback only; the splash hold is covered by `rootNavigator`/`rootLayout` tests. | reject |
| 19 | `USER_UPDATED` on a guarded screen untested (blind) | low | Same as #17. | reject |
| 20 | Blind's mid-session spurious `SIGNED_IN` re-flagging a fresh account | high | Same root cause as #1; the `!prev.session` condition covers it. | patch, with #1 |

## Design Notes

- **Overlap with open Epic 1 retro items.** Guarding `onboarding` with `session` closes the session-guard half of retro item 2. The check-your-email half stays open: with "Confirm email" on, a successful email sign-up now leaves the user on the sign-up form, where today they dead-end on onboarding. Moving cleanup onto `SIGNED_OUT` affects retro item 4; this story doesn't decide it, but note in `deferred-work.md` that item 4 must now be built against the provider.
- **Why `isNewUser` lives in the provider:** the guard moves the router off `(auth)` as soon as the session appears, before the handler's result returns, so a second `router.replace` would race it. `useIsNewUser()` is a separate reader because `useSession()`'s shape is frozen.
- **Provider sketch** (callback stays synchronous):
  ```ts
  supabase.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_IN' && next) setIsNewUser(isNewAccount(next.user));
    if (event === 'SIGNED_OUT') { setIsNewUser(false); queryClient.clear(); }
    setSession(next); setLoading(false);
  });
  ```

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: cold start signed in and signed out; a signed-in cold start from a `fittr://fit/<id>` link opens that fit; sign out from Profile; open a `fittr://` deep link while signed out; Apple/Google new and returning sign-in; background for more than an hour, then resume and pull data.
