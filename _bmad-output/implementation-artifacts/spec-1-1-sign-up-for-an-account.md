---
title: 'Sign Up for an Account'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no Fittr app yet — nothing exists beyond planning artifacts. A new user needs a way to create an account via Sign in with Apple, Google, or email/password, landing on onboarding afterward.

**Approach:** Bootstrap a fresh Expo/Router/TypeScript/NativeWind project wired directly to Supabase (Postgres + Auth), with the `profiles` table and its RLS policy as the first migration. Implement all three sign-up paths through Supabase Auth's own OAuth/password flows (no custom token-trust logic). Wire CI (lint/typecheck/test on PR), Sentry (crashes), and PostHog (a `signed_up` event with a `method` property) in the same story, per the epic decision that Story 1.1 is the project's bootstrap point rather than a separate infra story.

## Boundaries & Constraints

**Always:** `profiles` RLS as explicit per-operation policies — `USING (id = auth.uid())` for SELECT/UPDATE, `WITH CHECK (id = auth.uid())` for INSERT — never one blanket rule, and no client-side DELETE policy (account deletion is a service-role operation, Epic 6); `username`/`display_name` are NOT NULL and given a system-generated/placeholder value at row-creation time (see Design Notes), not left for a later step to fill; session persisted via an encrypted-`AsyncStorage` adapter with its AES key in `expo-secure-store` (per Supabase's own quickstart — a bare secure-store value can't hold a full session), never *unencrypted* `AsyncStorage`; Apple and Google identity tokens verified server-side via Supabase Auth's own provider flow (native `signInWithIdToken` for both, not a browser redirect), Apple's flow using a SHA-256-hashed nonce sent to Apple and the matching raw nonce sent to Supabase, Google's Supabase-dashboard provider config carrying both the Web and iOS Client IDs (comma-separated) with "Skip nonce check" enabled for iOS; TypeScript strict; NativeWind styling matching `DESIGN.md` (pure monochrome except the destructive-red and Google-logomark exceptions); an EAS development build for testing (Expo Go cannot host native Google Sign-In).

**Never:** a local database or offline cache-of-record; a custom backend or serverless function for anything in this story; secrets or API keys committed to git or embedded in the client bundle; recoloring the Google "G" logomark or extending color exceptions to any other element; implementing Apple/Google token verification client-side; configuring Google Sign-In with the iOS OAuth client ID where the Web client ID is required (the audience Supabase actually validates).

**Decisions (resolved during Checkpoint 1):**
- Repo layout: Expo app at repo root, alongside the existing `docs/`, `_bmad-output/`, `design-system/` planning directories.
- Auth-provider sequencing: build all three sign-up code paths (Apple, Google, email/password) in this story now. Email/password is device-testable immediately against Supabase. Apple and Google ship as working code but are only device-testable once Apple Developer Program enrollment (Services ID + Sign In with Apple capability) and a Google Cloud OAuth client exist — that external setup does not block finishing or merging the rest of this story.
- Observability: Sentry and PostHog SDKs are fully wired against placeholder env vars (`SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`); no events reach either service until real values are supplied later — this does not block anything else in the story.
- Bundle identifier / app scheme: `com.elvinly.fittr`, used for the iOS bundle ID, the Apple Sign-In entitlement, the Google OAuth client, and the `fittr://` deep-link scheme.
- Supabase credentials: user creates a real Supabase project and fills real values into `.env.local` themselves (gitignored) — the agent never sees or handles the Project URL/anon key directly; only variable names (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) go in the committed `.env.example`. Same self-managed-credential pattern as Sentry/PostHog.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Apple sign-up | Tap "Sign in with Apple," approve the system prompt | Supabase Auth creates the account via Apple's identity token; `profiles` row inserted; lands on onboarding; `signed_up` event (`method: apple`) reaches PostHog | N/A |
| Google sign-up | Tap "Continue with Google," approve the Google account picker | Supabase Auth creates the account via Google's identity token; `profiles` row inserted; lands on onboarding; `signed_up` event (`method: google`) reaches PostHog | N/A |
| Email sign-up | Enter a new email + password, submit | Supabase Auth creates the account; `profiles` row inserted; lands on onboarding; `signed_up` event (`method: email`) reaches PostHog | Weak password / invalid email format shown inline before submit |
| Duplicate email | Sign up with an already-registered email | Account not created | Clear "account already exists — sign in instead" message, link to sign-in |
| No network during any sign-up | Any of the above, offline | No account created, no partial state | "Check your connection and try again" message, user stays on the current screen with input intact |
| User cancels the native sign-in sheet | Apple/Google system prompt dismissed or backed out of | No account created, no error shown | Silently return to Welcome — this is a normal path, not a failure |
| Apple/Google account has no email on file | Successful native auth, provider returns no email claim | Account still created | `profiles`/`auth.users` proceed without an email value; nothing in this story depends on email being present for Apple/Google signups |
| App backgrounded mid-auth-handoff | User switches away during the native Apple/Google prompt, then returns | Auth flow resumes or cleanly re-presents Welcome | No crash, no stuck loading state, no duplicate account on retry |

</frozen-after-approval>

## Code Map

No existing code — this is a greenfield bootstrap (confirmed: repo currently holds only planning artifacts, no `package.json`/`app/`/native project of any kind). The new top-level layout is set once the repo-layout Open Question is answered; see Tasks & Acceptance.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `app.json`, `tsconfig.json` -- `npx create-expo-app` with TypeScript + Expo Router template, at repo root -- standard bootstrap, matches stack.md
- [ ] `.env.example` (committed) + `.env.local` (gitignored) -- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST` placeholders -- unblocks bootstrap before real credentials exist; nothing secret goes to git
- [ ] `app/_layout.tsx`, `app/(auth)/welcome.tsx` -- Welcome screen: three stacked sign-in-method buttons per DESIGN.md/EXPERIENCE.md -- entry point for all three flows
- [ ] `lib/supabase.ts` -- Supabase client using a hybrid storage adapter (session encrypted with an AES key held in `expo-secure-store`, encrypted blob stored in `AsyncStorage` — per Supabase's own quickstart, since a bare secure-store value can't hold a full session), `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false` -- security baseline, never unencrypted AsyncStorage
- [ ] `supabase/migrations/0001_profiles.sql` -- `profiles` table (`id`, `username` NOT NULL, `display_name` NOT NULL, `avatar_path`, `created_at`, `updated_at`) + explicit per-operation RLS policies (`USING`/`WITH CHECK` split, no DELETE policy) -- first migration, NFR5
- [ ] `app.json` config plugins -- `expo-apple-authentication` (`usesAppleSignIn: true`), Google Sign-In config plugin with iOS URL scheme, bundle identifier `com.elvinly.fittr` -- required native config, easy to silently omit
- [ ] Sign-up handler (shared by all three methods) -- on success, inserts the `profiles` row with system-generated `username` and a placeholder `display_name` (identity provider's name claim if present, else a generic default); onboarding (Story 1.3) later overwrites `display_name` -- resolves the username/display_name sequencing gap
- [ ] Apple Sign-In handler -- `expo-apple-authentication` + a generated nonce (SHA-256-hashed for the Apple request, raw value passed to Supabase `signInWithIdToken`) -- required by Supabase's Apple flow, easy to silently omit
- [ ] Google Sign-In handler -- `@react-native-google-signin/google-signin` configured with the **Web** OAuth client ID as `webClientId` (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, not the iOS client ID) + Supabase Auth `signInWithIdToken` -- per I/O matrix; requires EAS dev build
- [ ] Supabase Dashboard: Google provider configured with **both** the Web Client ID and iOS Client ID (comma-separated in the Client IDs field) and "Skip nonce check" enabled for iOS -- per Supabase's dedicated Google auth guide; without this, native iOS ID-token validation can fail even with correct app-side code
- [ ] Email/password sign-up screen + handler -- Supabase Auth `signUp`, inline validation, duplicate-email error message -- per I/O matrix
- [ ] Cancellation handling for Apple/Google native sign-in -- catch each SDK's cancellation error and return silently to Welcome, no error UI -- per I/O matrix
- [ ] `app/(auth)/components/ConnectionErrorNotice.tsx` -- shared "no connection" error state for all three sign-up methods -- per I/O matrix (renamed from the ambiguous `sign-in.tsx` to avoid confusion with the actual sign-in story)
- [ ] `.github/workflows/ci.yml` -- lint, typecheck, test on every PR -- stack.md CI requirement
- [ ] Sentry wiring (`@sentry/react-native` + Expo plugin) -- crash reporting from first launch
- [ ] PostHog wiring (`posthog-react-native` + provider) -- `signed_up` event with a `method` property covering all three auth methods
- [ ] Unit tests for the duplicate-email, no-connection, and cancellation edge cases from the I/O matrix
- [ ] Automated cross-user RLS test -- two test accounts, assert the second cannot SELECT the first's `profiles` row -- replaces relying on a one-time manual check for the non-negotiable RLS baseline

**Acceptance Criteria:**
- Given the Welcome screen, when I tap "Sign in with Apple," then Supabase Auth creates my account and I land on onboarding, with a `signed_up` event reaching PostHog
- Given the Welcome screen, when I tap "Continue with Google," then Supabase Auth creates my account and I land on onboarding, with a `signed_up` event reaching PostHog
- Given the Welcome screen, when I submit a new email/password, then Supabase Auth creates my account and I land on onboarding, with a `signed_up` event reaching PostHog
- Given an already-registered email, when I try to sign up with it, then I see "account already exists — sign in instead"
- Given no network connectivity, when I try any sign-up method, then I see a clear connection error and no account is partially created
- Given I cancel the Apple or Google native sign-in prompt, then I return to Welcome with no error shown and no account created
- Given any successful sign-up, then a `profiles` row exists with `username`/`display_name` populated (system-generated/placeholder, never null) and RLS enforcing `id = auth.uid()` via explicit per-operation policies
- Given two signed-up users, then an automated test confirms one cannot read the other's `profiles` row

## Implementation Notes

**Known residual risk:** Apple and Google Sign-In are built to completion in this story but cannot be device-tested until their respective external developer-console setups exist (Apple Developer Program enrollment + Services ID; Google Cloud OAuth client) — per the Decisions log. The nonce-handling and `signInWithIdToken` token-shape assumptions in this spec are based on current Supabase/Expo documentation, not verified against a live device flow. Flag any mismatch found during first real device test as a fast-follow fix, not a sign the whole approach was wrong.

## Spec Change Log

- **Trigger:** independent spec-review subagent (user-requested second opinion before approval).
- **Amended:** RLS from one blanket rule to explicit per-operation policies (no `profiles` DELETE policy); `username`/`display_name` sequencing (system-generated/placeholder at row creation, not left undefined); added Apple nonce-handling task; added Google Web-vs-iOS client ID distinction and `app.json` config-plugin task; added cancellation, no-email, and backgrounding rows to the I/O matrix with matching tasks/AC; added an automated cross-user RLS test; renamed the ambiguous shared error-state file; added the missing Google web-client-ID env var; corrected `stack.md`'s Auth row (was missing Google) and `data-model.md`'s RLS/profiles sections to match (both companions, fixed at the source alongside this spec).
- **Avoids:** shipping a `profiles` insert that violates a NOT NULL constraint at sign-up time; an RLS policy gap that could let a client write another user's row; two well-documented native-auth integration failures (nonce mismatch, wrong Google client ID) surfacing only at device-test time instead of being designed for upfront.
- **Keep:** the `signInWithIdToken`-for-both-providers approach and the CI/observability wiring — the review found these sound as originally drafted.
- **Trigger 2:** user-requested live documentation check against Supabase's own guides before approval.
- **Amended:** storage-adapter description corrected from "`expo-secure-store`, never `AsyncStorage`" to the actual official pattern (encrypted `AsyncStorage` blob, AES key in `expo-secure-store` — a bare secure-store value can't hold a full session); added the missing Supabase-dashboard step for Google (both Web + iOS Client IDs, comma-separated, plus "Skip nonce check" for iOS).
- **Avoids:** specifying a storage approach that would fail in practice once a real session object exceeds secure-store's per-item size limit; a Google sign-in that's coded correctly client-side but fails at the Supabase dashboard config layer for want of one undocumented checkbox.
- **Keep:** the decision to use native `signInWithIdToken` for Google rather than switching to a browser-based `signInWithOAuth()` — checked against Supabase's more specific, native-app-focused guide rather than the simpler general quickstart, and confirmed correct for this native iOS app.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| `profiles.display_name`/`username` NOT NULL vs. deferred onboarding value | high, fixed | Story 1.1's AC requires the row to exist at sign-up; Story 1.3 (onboarding) is where the user supplies display name — nothing specified the sign-up-time value before this fix |
| RLS policy under-specified (one blanket rule) | high, fixed | Postgres RLS needs `USING`/`WITH CHECK` split; a single rule risks an INSERT under another user's `id` going unblocked |
| Apple nonce handling missing | high, fixed | Supabase's documented `signInWithIdToken` + `expo-apple-authentication` flow requires a hashed-nonce round trip; absent from the original task list |
| Google Web vs. iOS OAuth client ID | high, fixed | `GoogleSignin.configure({ webClientId })` must use the Web client (Supabase's validation audience), a well-documented common mistake; original spec didn't distinguish them |
| I/O matrix missing cancellation/no-email/backgrounding rows | medium, fixed | Cancellation is a normal, frequent path more likely than the no-network row already covered |
| RLS verification manual-only | medium, fixed | A one-time SQL-editor check isn't repeatable or CI-gated for a non-negotiable security baseline |
| `stack.md` Auth row omitted Google | high, fixed | Companion doc contradicted `SPEC.md` CAP-1 after the earlier Google addition — an oversight in this session, not the review agent's invention |
| Storage baseline overstated as "secure-store only, never AsyncStorage" | high, fixed | Live check of Supabase's own quickstart: `expo-secure-store`'s ~2048-byte per-item limit can't hold a full session; official pattern is an encrypted AsyncStorage blob with the AES key in secure-store |
| Google dashboard config incomplete (Web Client ID only) | high, fixed | Supabase's dedicated Google auth guide: both Web and iOS Client IDs required (comma-separated), plus "Skip nonce check" for iOS — missing this fails token validation even with correct client code |

## Design Notes

Apple and Google both authenticate through Supabase Auth's native OAuth/identity-token flow (`supabase.auth.signInWithIdToken`), not a hand-rolled OAuth dance — this keeps token verification server-side per the security baseline and avoids a custom trust boundary. Verified against Supabase's dedicated Google auth guide (not just the general quickstart, which suggests a simpler browser-redirect approach better suited to apps that don't need a native picker) — native `signInWithIdToken` is Supabase's own recommendation for native mobile apps and is what this spec uses.

Storage adapter follows Supabase's official Expo React Native quickstart pattern: a bare `expo-secure-store` value has a ~2048-byte per-item limit a full session can exceed, so the quickstart encrypts the session with an AES key (generated via `react-native-get-random-values`, held in `expo-secure-store`) and stores the encrypted blob in `AsyncStorage` — not "session in secure-store, full stop," which the first draft of this spec assumed.

Sources checked (per explicit request to verify against current documentation rather than assume): `supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth` (storage adapter pattern, Apple nonce flow) and `supabase.com/docs/guides/auth/social-login/auth-google` (native vs. browser-redirect guidance, dual Client ID + Skip-nonce-check requirement).

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all unit tests pass, including the duplicate-email, no-connection, and cancellation cases, plus the automated cross-user RLS test (two test accounts, second cannot SELECT the first's `profiles` row)

**Manual checks (if no CLI):**
- On an EAS development build on a physical iPhone: complete each of the three sign-up flows once and confirm a `profiles` row + PostHog event for each.
