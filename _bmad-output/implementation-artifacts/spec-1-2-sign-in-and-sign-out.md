---
title: 'Sign In and Sign Out'
type: 'feature'
created: '2026-09-11'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
baseline_commit: 'd6f8aa1101926d5ccc61bfe9eeb4125c96793842'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Returning users have no way back into the app: there is no email/password sign-in flow, and Apple/Google's `signInWithIdToken` call (already shared between sign-up and sign-in) always fires `signed_up` again and routes to onboarding even for an existing account. There is also no real Sign Out (only a `__DEV__`-only button on the onboarding placeholder) and no Home/Profile surface to land on or sign out from.

**Approach:** Add an email/password sign-in flow mirroring the existing sign-up form pattern. Make the Apple/Google handlers detect returning vs. new accounts so returning users skip `signed_up` and land on Home instead of onboarding. Stand up the full five-tab shell (Home, Wardrobe, Fits, Planner, Profile) now, per the epic's app-shell note — Home and Profile get minimal real content (Home: placeholder body; Profile: display name + Sign Out), the other three tabs are bare placeholders owned by their own epics.

## Boundaries & Constraints

**Always:** reuse `signInWithIdToken` as the single Apple/Google entry point for both sign-up and sign-in (no new client-side token logic); classify invalid-credentials and no-connection errors distinctly, following the existing `SignUpError`/`isNoConnectionError` pattern in `lib/auth/errors.ts`; Sign Out calls `supabase.auth.signOut()` and returns to Welcome; keep the `profiles` RLS and session-storage baseline from Story 1.1 untouched; tab bar uses text-only labels (no new icon dependency — `@expo/vector-icons` isn't currently installed).

**Never:** add new database tables or migrations; give Wardrobe/Fits/Planner real content (their own epics); implement custom Apple/Google identity-token verification; persist an "onboarding complete" flag (no such column exists yet — Story 1.3's scope).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Email sign-in, correct password | Registered email + correct password, submit | Supabase `signInWithPassword` succeeds; lands on Home | N/A |
| Email sign-in, wrong password | Registered email + wrong password | Stays on sign-in screen | Clear "invalid email or password" message, input intact |
| Apple/Google sign-in, returning user | Tap "Sign in with Apple" / "Continue with Google" on an existing account | `signInWithIdToken` succeeds; `isNewUser: false` returned to `welcome.tsx`; lands on Home; `signed_up` NOT re-fired | N/A |
| Apple/Google sign-up, new user | Same buttons, no existing account | `isNewUser: true` returned (unchanged behavior otherwise); lands on onboarding; `signed_up` fires | N/A |
| No connection during sign-in | Any of the three methods, offline | No session created | "Check your connection and try again," remains on sign-in screen, input intact |
| Sign Out | Signed-in session, tap Sign Out on Profile | Session cleared, returned to Welcome | N/A |

</frozen-after-approval>

## Code Map

- `lib/auth/emailSignUp.ts` -- pattern to mirror for new `lib/auth/emailSignIn.ts` (`signInWithPassword` instead of `signUp`; no duplicate-email case, add invalid-credentials case).
- `lib/auth/errors.ts` -- add an `invalid_credentials` kind alongside existing `duplicate_email`/`no_connection` on the same error class (rename class usage or add a sibling `SignInError` — implementer's call, keep the existing kind-based classification pattern). Supabase returns this as an `AuthApiError` with `status: 400` and message "Invalid login credentials" — classify on that shape, mirroring `isDuplicateEmailError`'s pattern.
- `lib/auth/appleSignIn.ts`, `lib/auth/googleSignIn.ts` -- after `signInWithIdToken` succeeds, compare `data.user.created_at` vs `data.user.last_sign_in_at` (both server-clock timestamps, no client clock-skew risk) to detect a new account: within 2 seconds = new. Change the return type from `{status: 'success'} | {status: 'cancelled'}` to `{status: 'success', isNewUser: boolean} | {status: 'cancelled'}`; only call `trackSignedUp` when `isNewUser`. Routing itself stays in `welcome.tsx` (these functions don't import `expo-router` today and shouldn't start).
- `app/(auth)/sign-in.tsx` -- currently a placeholder ("Sign-in is being built next"); replace with the real email/password sign-in form, mirroring `app/(auth)/email-sign-up.tsx`'s layout/validation/error-display pattern.
- `app/(auth)/welcome.tsx` -- add an "Already have an account? Sign in" link to `/(auth)/sign-in` (today it's only reachable via the duplicate-email error link); update `handleApple`/`handleGoogle`'s success branch to route to onboarding when `result.isNewUser` else the tabs root (Home) — this is the actual routing decision point, not the two lib functions.
- `app/index.tsx` -- currently always redirects an existing session to `/onboarding`; change to redirect to the tabs root (Home) instead, since there's no onboarding-completion flag to gate on yet (Story 1.3 scope).
- `app/onboarding.tsx` -- remove the `__DEV__`-only sign-out button now that Profile has a real one.
- `app/_layout.tsx` -- register the new `(tabs)` route group in the root `Stack`.
- New: `app/(tabs)/_layout.tsx` -- five-tab `Tabs` layout (Home, Wardrobe, Fits, Planner, Profile), text-only labels.
- New: `app/(tabs)/index.tsx` (Home) -- minimal placeholder body, matching `onboarding.tsx`'s current placeholder style.
- New: `app/(tabs)/wardrobe.tsx`, `app/(tabs)/fits.tsx`, `app/(tabs)/planner.tsx` -- bare "coming soon" placeholders, same style.
- New: `app/(tabs)/profile.tsx` -- fetches the signed-in user's `profiles` row (`display_name`) via a `useQuery`, shows a loading indicator while pending and a `ConnectionErrorNotice`-style message on fetch failure (consistent with the no-offline-mode principle applied elsewhere), and a Sign Out button (`supabase.auth.signOut()` then `router.replace('/(auth)/welcome')`).
- `lib/analytics/posthog.ts` -- no change needed; `trackSignedUp` just must not be called on the returning-user path (handled in the two sign-in handlers above).
- `__tests__/emailSignUp.test.ts`, `__tests__/errors.test.ts` -- existing patterns to mirror for the new sign-in unit tests.

## Tasks & Acceptance

**Execution:**
- [x] `lib/auth/errors.ts` -- add an `invalid_credentials` error kind + `isInvalidCredentialsError` classifier -- needed to distinguish wrong-password from no-connection on sign-in
- [x] `lib/auth/emailSignIn.ts` -- new `signInWithEmail(email, password)` using `supabase.auth.signInWithPassword`, classifying no-connection and invalid-credentials errors -- mirrors `emailSignUp.ts`
- [x] `lib/auth/appleSignIn.ts`, `lib/auth/googleSignIn.ts` -- return `isNewUser` (via `created_at`/`last_sign_in_at`, <2s apart = new) alongside `status: 'success'`; skip `trackSignedUp` when not new -- fixes the shared-call ambiguity between sign-up and sign-in
- [x] `app/(auth)/sign-in.tsx` -- replace the placeholder with a real email/password sign-in form (reusing `email-sign-up.tsx`'s layout), routing to the tabs root on success -- closes the email sign-in gap
- [x] `app/(auth)/welcome.tsx` -- add "Already have an account? Sign in" link; update `handleApple`/`handleGoogle` to route to onboarding or the tabs root based on `result.isNewUser` -- makes sign-in reachable outside the duplicate-email error path and fixes the actual routing decision point
- [x] `app/index.tsx` -- redirect an existing session to the tabs root instead of `/onboarding` -- returning users should not see onboarding again
- [x] `app/(tabs)/_layout.tsx` + `index.tsx` + `wardrobe.tsx` + `fits.tsx` + `planner.tsx` + `profile.tsx` -- stand up the five-tab shell, Home and Profile with real minimal content, the rest bare placeholders -- per epic app-shell note and this story's Home/Profile requirement
- [x] `app/_layout.tsx` -- add `(tabs)` to the root `Stack.Screen` list -- required for the new route group to resolve
- [x] `app/onboarding.tsx` -- remove the `__DEV__`-only sign-out button -- superseded by Profile's real Sign Out
- [x] Unit tests for `emailSignIn.ts` (invalid credentials, no connection) and the Apple/Google `isNewUser` branch (both the <2s-new and the clearly-returning case) -- per the I/O matrix

**Acceptance Criteria:**
- Given a registered account, when I sign in with Apple, Google, or correct email/password, then I land on Home
- Given incorrect email/password, when I try to sign in, then I see a clear invalid-credentials error and remain signed out
- Given I am signed in, when I tap Sign Out on Profile, then my session ends and I'm returned to the Welcome screen
- Given no network connectivity, when I try to sign in by any method, then I see a clear "check your connection" message rather than a hang or crash
- Given a returning user signs in via Apple or Google, then no duplicate `signed_up` event is recorded

## Implementation Notes

Implemented directly task-by-task (no implementation subagent), with each task reviewed by the user before moving to the next, per the user's standing preference for incremental review.

Two issues surfaced during verification, not anticipated in the spec, both fixed inline:
- Expo Router's typed routes (`.expo/types/router.d.ts`) don't generate a bare `/(tabs)` href for a group — only the concrete leaf path `/(tabs)/index`. All four `router.replace('/(tabs)')`/`Redirect href="/(tabs)"` call sites (`sign-in.tsx`, `welcome.tsx` x2, `index.tsx`) were written as `/(tabs)/index` instead.
- `isNewAccount`'s parameter type used `last_sign_in_at: string | null`, but Supabase's `User` type has it as `string | undefined`; widened to `string | null | undefined`.

All three verification commands ran clean: `npm run lint`, `npm run typecheck`, `npm test` (32 passed, 1 pre-existing skip unrelated to this story).

**Post-implementation fixes (found during the user's first real device test, not caught by `tsc` or any test):**
- **`/(tabs)/index` was never a valid runtime route** — Expo Router strips group segments from real URLs, so the flattened path for `app/(tabs)/index.tsx` is `/(tabs)` (or bare `/`), not `/(tabs)/index`. The `.expo/types/router.d.ts` snapshot used during implementation was stale (generated before the dev server had ever run against the finished `(tabs)` group), and it happened to list `/(tabs)/index` as a typed-route leaf while rejecting bare `/(tabs)` — `tsc` passing on `/(tabs)/index` was not evidence it was a real route. Signing in with Google hit exactly this path and produced Expo Router's "Unmatched Route" screen. Fixed by replacing all six occurrences (`sign-in.tsx`, `welcome.tsx` x2, `index.tsx`, `onboarding.tsx`, and the two render tests asserting on it) with `/(tabs)`. **Lesson:** a stale `.expo/types` file can make `tsc` accept a href that doesn't actually resolve at runtime — a real navigation needs to be exercised on a live dev server at least once, typecheck passing is not sufficient proof for router hrefs specifically.
- **`ConnectionErrorNotice` under `app/(auth)/components/` produced a real runtime warning**, not just the cosmetic code-organization nit this spec's Review Triage Log rejected it as ("low, reject... moving it ripples import paths for marginal benefit"): Expo Router scans every `.tsx` file under `app/` as a route candidate regardless of subfolder name, and warned that this file (a named export, not a route) was "missing the required default export." That earlier triage verdict is superseded by this evidence. Fixed by moving the component to `components/ConnectionErrorNotice.tsx` (sibling to the existing `components/ui/`, outside `app/` entirely) and updating all four importers (`welcome.tsx`, `email-sign-up.tsx`, `sign-in.tsx`, `profile.tsx`).

Re-verified after both fixes: `npm run lint`, `npm run typecheck`, `npm test` (45 passed) all clean.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| `isNewAccount`/`NEW_ACCOUNT_THRESHOLD_MS` duplicated verbatim between `appleSignIn.ts` and `googleSignIn.ts` | low, patch | Real duplication introduced within this same diff; two sources of truth for the threshold/logic. Trivial to extract to a shared module. |
| `returningUser.test.ts` never exercises the `last_sign_in_at` null/undefined branch, despite Implementation Notes calling out the type widening for exactly this case | low, patch | Confirmed: both tests use populated timestamps only; the `!user.last_sign_in_at` early-return path has zero coverage. |
| `applyProviderDisplayName` runs unconditionally on every Apple/Google sign-in (not just new accounts), silently re-applying the provider's name claim on every returning sign-in | medium, patch | Real design gap: the original comment ("onboarding overwrites this regardless") was true when only new signups hit this path; now returning users hit it too, and once Story 1.3 ships editable display names this would clobber a user's own edit on next sign-in. Currently no live harm (no edit UI exists yet), but the fix (gate on the `isNewUser` flag already computed) is free. |
| `isInvalidCredentialsError` matches on a message regex with a loose non-`AuthApiError` fallback | low, reject | Deliberately mirrors `isDuplicateEmailError`'s established, already-shipped-and-reviewed pattern (Story 1.1), per the spec's own Code Map instruction to match that shape. Changing the matching strategy here is a bigger, riskier change than a direct correction, for a case that hasn't caused any actual problem. |
| No auth guard on `(tabs)` route group: a session that becomes invalid while a tab is mounted (expiry, remote sign-out) leaves `profile.tsx` showing neither a spinner nor an error — `isLoading` is `false` when the query is `enabled: false`, so it silently renders a blank name area | medium, patch | Verified against TanStack Query v5 semantics: `isLoading = isPending && isFetching`, and `isFetching` is `false` when disabled, so `isLoading` is `false` too. `app/index.tsx`'s guard only fires once at cold start, not continuously. Real, plausible trigger (token expiry); fix is a small guard mirroring `index.tsx`'s existing `useSession` + `Redirect` pattern. |
| `profile.tsx` maps every `profiles` query failure to the generic `NO_CONNECTION_MESSAGE`, which could mislead a user for a non-connectivity failure | low, reject | Matches the spec's own Design intent verbatim ("ConnectionErrorNotice-style message... consistent with the no-offline-mode principle applied elsewhere"). Also the only realistic failure mode today: every account has a `profiles` row (Story 1.1's atomic trigger) and RLS always permits reading one's own row, so a non-connectivity failure isn't currently reachable. |
| No screen-level test for `app/(auth)/sign-in.tsx`'s error-kind-to-message wiring (`no_connection` → banner vs. `invalid_credentials` → field message) | medium, patch | Verification-gap finding (pre-verified): no test renders `sign-in.tsx`; only the underlying `signInWithEmail` function is tested. Swapping the two branches would misdirect the user with no test catching it. |
| `ConnectionErrorNotice` lives under the `(auth)`-scoped path but is now also imported by `(tabs)/profile.tsx` | low, reject | Cosmetic code-organization preference, not a functional defect; moving it ripples import paths for marginal benefit. |
| `handleSignOut` doesn't invalidate the cached `['profile', userId]` query on sign-out, risking stale display-name data on account switch | false | `queryKey` already includes `userId` (verified: `app/(tabs)/profile.tsx:21`), so a different account after sign-in produces a distinct, never-before-fetched cache entry — there is no stale data to show. |
| No "Forgot password?" affordance on the sign-in screen; epic-1-context.md's UX flow explicitly calls for "sign up/sign in with email (password reset via email)" and neither Story 1.1 nor this spec built it | medium, defer | Real, verifiable gap against loaded planning context — but pre-existing: Story 1.1 already omitted password reset when it built the email sign-up form, so this predates and is not caused by this story's diff. |
| No spec/test coverage for "sign-in succeeds but the subsequent `profiles` fetch fails" hand-off | low, reject | Same territory as the generic-error-message finding above — already covered by the spec's deliberate uniform-error-message design; not a distinct defect. |
| `lib/auth/emailSignIn.ts` has no guard for `signInWithPassword` resolving with `error: null` but no user/session, unlike `emailSignUp.ts`'s analogous check | false | `signInWithPassword`'s API contract guarantees a populated user+session on any non-error response — unlike `signUp`, which has a distinct "email confirmation pending" success-with-null-session case that justifies the check in `emailSignUp.ts`. That edge case doesn't exist for password sign-in. |
| `isNewAccount` in `appleSignIn.ts` has no guard against `created_at`/`last_sign_in_at` parsing to `NaN` | low, reject | `created_at` is a NOT NULL, SDK-guaranteed well-formed ISO timestamp from Postgres/Supabase Auth — not a realistically reachable trigger. Guarding against it is speculative complexity for a value the type system already treats as always present and well-formed. |
| Same NaN-guard finding for `isNewAccount` in `googleSignIn.ts` | low, reject | Same reasoning as the Apple case above. |
| `profile.tsx`'s `useSession`/query state produces a blank screen (no spinner, no error) when session resolves to null post-mount | medium, patch | Same root cause as the `(tabs)` auth-guard finding above — merged into that fix. |
| `supabase.auth.signOut()` in `profile.tsx` has no try/catch for a hypothetical thrown exception | false | Refuted by this review's own separate verification of `@supabase/auth-js`'s `_signOut` implementation: it clears the local session in every branch (success or failure) rather than throwing, so `router.replace` after the `await` always fires correctly regardless of network state. |
| A new user who backgrounds/relaunches mid-onboarding now lands on Home instead of resuming onboarding | low, defer | Real behavior, but already explicitly documented and accepted in this spec's own Design Notes as a deferred residual risk, and its only real fix (a persisted onboarding-completion flag) is directly excluded by this spec's frozen `Never` boundary ("persist an 'onboarding complete' flag... Story 1.3's scope"). |
| `app/onboarding.tsx` is now a total navigation dead end after this diff removes its `__DEV__`-only sign-out button — no `Link`, `Button`, or other way to leave the screen | low, patch | Verified: the file has no navigation of any kind. Only genuinely-new signups reach this screen (returning users now route straight to Home), so impact is narrow, but it is a real, verified regression in tester/dev ergonomics with a trivial fix (add a forward link). |
| `app/(auth)/welcome.tsx`'s `isNewUser` routing ternary (the actual fix this story exists to make) has no test — a reverted or inverted ternary would send every returning Apple/Google user back to onboarding, or vice versa, undetected | medium, patch | Verification-gap finding (pre-verified): no test renders or imports `welcome.tsx`; `returningUser.test.ts` only covers the lib-level `isNewUser` computation, not its consumption. |
| `app/index.tsx`'s redirect-target change (`/onboarding` → `/(tabs)/index` for an existing session) has no test | low, defer | Verification-gap finding (pre-verified). Same shape of coverage gap as the `welcome.tsx`/`sign-in.tsx` findings but lower-risk (single conditional, no branch logic); reviewer's own suggested disposition. |
| `app/(tabs)/profile.tsx`'s Sign Out button has no test — it is now the only sign-out path in the app | medium, patch | Verification-gap finding (pre-verified): no test renders `profile.tsx` or asserts `supabase.auth.signOut`/`router.replace` are called. This diff removes the only other sign-out entry point (`onboarding.tsx`'s dev button), raising the stakes of an undetected regression here. |

## Design Notes

Supabase's native `signInWithIdToken` does not expose an explicit "was this a new account" flag. The documented workaround (used here) is comparing the returned user's `created_at` and `last_sign_in_at` timestamps, both set server-side by Postgres/Supabase Auth (no client clock-skew risk): within 2 seconds apart = new account; otherwise returning. This keeps the "no custom trust logic" boundary intact since it only reads fields Supabase already returns. Routing on this flag happens in `welcome.tsx`, not inside `appleSignIn.ts`/`googleSignIn.ts` — those stay pure functions returning a result object, consistent with how they're structured and tested today (`__tests__/cancellation.test.ts` mocks only Supabase/PostHog, not `expo-router`).

Tab bar ships with text-only labels rather than icons: `@expo/vector-icons` is not currently an installed dependency, and DESIGN.md's monochrome, typography-led language doesn't require icons for a 5-item tab bar. Adding an icon set is a separate, later decision if the team wants one.

**Known residual risk (deferred, not fixed here):** a new user who backgrounds or force-quits mid-onboarding and relaunches will now land on Home instead of resuming onboarding, since `app/index.tsx` can't distinguish "new account, onboarding incomplete" from "returning user" without a persisted flag — that flag is Story 1.3's scope (profile setup). Flag as a fast-follow if it surfaces as a real user complaint before Story 1.3 ships.

epics.md's Story 1.2 AC1 phrase "land on Home with my data loaded directly from Supabase" is read here as the epic's standing architecture reminder (direct Supabase reads, no local-first cache — established in Epic 1) rather than a literal requirement for Home to render real data; Home has no real data to load until later epics (Wardrobe, Fits, Planner) exist.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all unit tests pass, including new sign-in and returning-user-detection cases

**Manual checks (if no CLI):**
- On an EAS development build: sign in with an existing account via each of the three methods and confirm landing on Home; sign out from Profile and confirm return to Welcome; attempt sign-in with a wrong password and confirm the error message.
