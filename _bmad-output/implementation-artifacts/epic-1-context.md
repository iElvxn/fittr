# Epic 1 Context: Accounts & Foundation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a working Expo app wired directly to Supabase and let a new user create an account (Sign in with Apple, Google, or email/password), sign in, sign out, and set up a display name and optional avatar. This epic is also the project's bootstrap: there is no separate infra story, so Story 1.1 stands up the Expo/Router project, the Supabase project and its first migration, CI, and the Sentry/PostHog SDKs. Everything later epics build (Wardrobe, Fits, Planner) depends directly on the online-only, no-custom-backend architecture, the auth security baseline, and the RLS pattern established here.

## Stories

- Story 1.1: Sign Up for an Account
- Story 1.2: Sign In and Sign Out
- Story 1.3: Set Up and Edit Profile

## Requirements & Constraints

- Account creation supports Sign in with Apple, Google, and email/password; signing up with an already-registered email must show a clear "account already exists — sign in instead" error rather than a generic failure.
- Google Sign-In requires an EAS development build — Expo Go cannot host native Google auth (the same constraint as the later on-device background-removal module) — so a dev build on a physical iPhone is required from this epic onward, not deferred.
- Every account has a required display name and an optional avatar image, plus a unique lowercase `username` that the system generates (not user-supplied) — not surfaced in the UI beyond profile settings (no username search in Phase 1).
- Minimum supported OS is iOS 17.0 (required by a later epic's on-device background-removal module, but the deployment target must be set correctly from this epic).
- No offline mode: every read/write requires network connectivity. Sign-in with no connectivity must show a clear "check your connection" message and leave the user on the sign-in screen — never a hang or crash.
- Auth security baseline, established here and binding on every later epic: Apple and Google identity tokens verified server-side (via Supabase's native `signInWithIdToken`, no custom trust boundary); session persisted via an encrypted-`AsyncStorage` adapter with its AES key held in `expo-secure-store` (a bare secure-store value can't hold a full session — its ~2048-byte per-item limit), never *unencrypted* `AsyncStorage`; row-level security enabled from the first migration, never retrofitted, with explicit per-operation policies rather than one blanket rule; no secrets or API keys embedded in the client bundle; all Supabase traffic over HTTPS.
- Google's Supabase-dashboard provider config needs both the Web Client ID and iOS Client ID (comma-separated in one field), plus "Skip nonce check" enabled for iOS — missing this fails native iOS token validation even with correct app-side code.
- All data is private per-user: row-level security scoped to `auth.uid()` is required starting with the very first table (`profiles`), not added later.
- No custom backend or serverless functions beyond Supabase, except where a secret or trust boundary requires one.
- Signup must record a `signed_up` event (with a `method` property covering all three auth methods) that reaches PostHog; crash reporting (Sentry) must be wired from first launch.
- Ten-items-in-three-minutes and other Wardrobe/Fit success criteria belong to later epics, not this one — this epic's success bar is: sign up, sign in, sign out, and profile edit all complete successfully on a dev build via each of the three auth methods, with a test analytics event reaching PostHog.

## Technical Decisions

- Stack: Expo SDK (latest stable), React Native, TypeScript strict, Expo Router; NativeWind for styling.
- Auth and data: Supabase Auth (Apple, Google, and email/password) and Supabase Postgres, accessed directly from the client — no local database, no offline cache-of-record. SQL migrations live in `supabase/migrations`.
- Apple and Google both authenticate via native `signInWithIdToken` — Supabase verifies each provider's identity token server-side, so the client never implements its own token-trust logic for either provider (checked against Supabase's dedicated Google auth guide, which recommends this over a browser-redirect `signInWithOAuth()` flow for native apps). Session is persisted via an encrypted-`AsyncStorage` adapter with its AES key in `expo-secure-store`, per Supabase's own quickstart — never unencrypted `AsyncStorage`.
- State: TanStack Query for server data (direct Supabase reads/writes); Zustand reserved for UI/session state (not needed for auth itself, but is the project-wide convention).
- CI/delivery: GitHub Actions running lint, typecheck, and test on every PR; EAS Build/Submit for native builds. Development happens on an EAS development build on a physical iPhone from this epic onward, since Expo Go can't host Google Sign-In or the background-removal module used in a later epic.
- Observability: Sentry for crashes, PostHog for product events — both wired in this epic since every later epic's analytics depends on this plumbing existing.
- `profiles` table: `id` (equals `auth.users.id`); `username` (unique, lowercase, NOT NULL, system-generated at row creation during sign-up, immutable, never user-supplied); `display_name` (NOT NULL, but only a placeholder at row-creation time — the identity provider's name claim if Apple/Google supplied one, else a generic default — which the user overwrites during onboarding in Story 1.3, not at row-creation); `avatar_path` (nullable storage path); `created_at`/`updated_at`.
- `profiles` RLS: explicit per-operation policies, not one blanket rule — `USING (id = auth.uid())` for SELECT/UPDATE, `WITH CHECK (id = auth.uid())` for INSERT/UPDATE. No client-side DELETE policy on `profiles`: account deletion is a service-role operation (Epic 6), not something this epic's client-facing policies need to allow.
- Storage: avatar uploads go to `wardrobe/{user_id}/avatar.jpg`; the Storage bucket enforces that object paths start with `auth.uid()/`. This is the first use of the `ImageStore`-style per-user storage prefix pattern that later epics (wardrobe items, Fit covers) reuse.
- IDs are client-generated UUIDs throughout the data model (established convention, applies to `profiles.id` via `auth.users.id`).

## UX & Interaction Patterns

- Flow: Welcome (one-line value proposition, three stacked sign-in-method buttons — Sign in with Apple, Continue with Google, Continue with email) → sign up/sign in with email (password reset via email) → onboarding (display name required before continuing — this is where the user overwrites the system-generated placeholder, then optional avatar picker) → guided "Add your first 5 items" step (progress indicator, skippable — the first-5-items step itself is Epic 6, but onboarding's display-name/avatar step is this epic).
- Sign-in method buttons all use the same secondary-button treatment (outline, monochrome, stacked full-width). Google's button is the sole exception carrying color: its official multi-color "G" logomark, icon-only, per Google's brand guidelines (uneditable) — button chrome and text otherwise stay monochrome, same as Apple's and email's buttons. This is one of only two color exceptions in the entire visual system (the other being destructive-red for delete confirmations/errors).
- Profile screen: view/edit display name and avatar at any time, plus Sign Out. Delete Account lives on Profile but is Epic 6 scope.
- Voice: short, complete sentences, no exclamation marks or gamified copy. Error/status copy patterns to follow: "No connection — nothing was lost. Try again" style for save failures; for sign-in specifically, "Check your connection and try again," remaining on the sign-in screen.
- Visual language is pure monochrome (warm ink/warm white/grays only, no accent color, apart from the Google "G" and destructive-red exceptions above); a serif display face (Cormorant) is reserved for one hero moment per screen (e.g. an onboarding headline), body/labels use Montserrat. Buttons: solid ink-fill primary, outline secondary — hierarchy from fill-vs-outline, not color. Custom fonts must scale explicitly with Dynamic Type (no relying on default scaling).
- Standard iOS tab bar (Home, Wardrobe, Fits, Planner, Profile) is the app shell this epic must stand up, even though only Profile has real content in Epic 1.

## Cross-Story Dependencies

- Story 1.1 must complete first: it creates the Expo project, the EAS dev-build setup (required for Google Sign-In), the Supabase project/migration/RLS, and CI — Stories 1.2 and 1.3 build directly on that scaffolding and on the `profiles` table it creates, including its system-generated `username` and placeholder `display_name`.
- Story 1.3's onboarding (overwriting the placeholder display name with a real one, optional avatar) runs immediately after Story 1.1's sign-up, before a user reaches Home.
- This epic's RLS pattern (`auth.uid()` scoping with explicit per-operation policies), auth security baseline (secure-storage tokens, server-verified identity tokens via `signInWithIdToken`, no client secrets), and per-user Storage prefix convention are the template every later epic's tables, auth touchpoints, and storage paths must follow.
- Epic 6 (Delete Account) will later need to hard-delete the `profiles` row and `avatar.jpg` object this epic creates via a service-role operation (since `profiles` has no client-side DELETE policy), and depends on the auth/session plumbing this epic establishes.
