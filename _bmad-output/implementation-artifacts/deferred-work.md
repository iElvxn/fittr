- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Build password reset via email on the sign-in screen.
  evidence: epic-1-context.md's UX flow explicitly calls for "sign up/sign in with email (password reset via email)", but neither Story 1.1 (email sign-up) nor Story 1.2 (email sign-in) implemented it. Pre-existing gap predating this story, not caused by its diff.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: A new user who backgrounds/relaunches mid-onboarding lands on Home instead of resuming onboarding, since there's no persisted onboarding-completion flag.
  evidence: Already documented and accepted as a residual risk in spec-1-2's Design Notes. Its only real fix (a persisted "onboarding complete" flag) is directly excluded by spec-1-2's frozen Never boundary and belongs to Story 1.3 (profile setup).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Add a render test for app/index.tsx's cold-start redirect (existing session -> /(tabs)/index vs. no session -> /(auth)/welcome).
  evidence: Verification-gap finding: no test renders or imports app/index.tsx, so a reverted or altered redirect target would ship undetected. Lower risk than the welcome.tsx/sign-in.tsx/profile.tsx gaps (single conditional, no branch logic) — reviewer's own suggested disposition was defer rather than patch.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-set-up-and-edit-profile.md`
  summary: A new user who backgrounds/relaunches mid-onboarding lands on Home instead of resuming onboarding — derive "incomplete" from the placeholder display name and redirect app/index.tsx to /onboarding accordingly.
  evidence: Not one of Story 1.3's actual acceptance criteria in epics.md (display name required, avatar upload, profile view/edit) despite being related and previously deferred here from spec-1-2 to "Story 1.3". Split out at token-budget time to keep spec-1-3 scoped to its literal ACs; still worth doing as its own small, self-contained follow-up.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-set-up-and-edit-profile.md`
  summary: No way to remove a previously-set avatar and revert to having none.
  evidence: Review finding (blind-hunter): not required by any of Story 1.3's ACs, and the frozen `Never` boundary explicitly forbids a Storage DELETE policy — a clean removal feature would need one (or a distinct null-avatar sentinel), which is a real design decision beyond this story's scope.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-sign-up-for-an-account.md`
  summary: Email sign-up never checks whether Supabase actually returned a session (it only checks `data.user`), so with "Confirm email" on (the project's deliberate setting), a brand-new email/password account has no session and silently can't do anything on the next screen — no error, no "check your email" messaging, just a dead Continue button on onboarding.
  evidence: Found during live device testing of Story 1.3's onboarding screen: `email-sign-up.tsx` unconditionally routes to `/onboarding` after `signUpWithEmail` resolves, and `handleContinue`'s `if (!userId) return;` guard silently no-ops with no session. Root cause is in Story 1.1's sign-up flow, not Story 1.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-browse-and-filter-the-wardrobe.md`
  summary: Add a repo-wide convention (and initial coverage) for testing `Sentry.captureException` calls -- no test anywhere in the codebase currently mocks `@/lib/observability/sentry` or asserts these calls fire/don't fire.
  evidence: Verification-gap finding on this story's new `Sentry.captureException(error)` call in `app/(tabs)/wardrobe.tsx` for unknown wardrobe-load errors: untested, and a regression removing or inverting it would ship undetected. The identical gap already exists for the two pre-existing `Sentry.captureException` calls in `app/add-item.tsx` (Story 2.1), so fixing it only here would be an inconsistent, one-off convention rather than closing the actual gap.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-batch-add-items-via-library-multi-select-or-rapid-camera.md`
  summary: No automated screen-level test exists for `app/add-item.tsx` or `components/wardrobe/CameraFilmstrip.tsx`, so `handleSaveAll`'s readiness guard, `handleShutterPress`'s re-entrancy/error handling, source-dependent `handleRetake` branching, and the `batchSize`-carrying `trackItemAdded` analytics loop are all verified only by manual on-device testing.
  evidence: Verification-gap and blind-hunter findings, same root cause: this repo has no established pattern for testing screens with heavy native-module entanglement (`ActionSheetIOS`, `CameraView`, `ImagePicker`) -- Story 2.1's `app/add-item.tsx` set this precedent (two real bugs there were only ever caught by manual device testing, per its own Review Triage Log). Closing this properly would mean either extracting the screen's pure orchestration logic into testable helpers, or building a component-interaction test harness for this class of screen -- both bigger than a single story's scope.
