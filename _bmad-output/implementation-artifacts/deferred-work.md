- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Build password reset via email on the sign-in screen.
  evidence: epic-1-context.md's UX flow explicitly calls for "sign up/sign in with email (password reset via email)", but neither Story 1.1 (email sign-up) nor Story 1.2 (email sign-in) implemented it. Pre-existing gap predating this story, not caused by its diff.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: A new user who backgrounds/relaunches mid-onboarding lands on Home instead of resuming onboarding, since there's no persisted onboarding-completion flag.
  evidence: Already documented and accepted as a residual risk in spec-1-2's Design Notes. Its only real fix (a persisted "onboarding complete" flag) is directly excluded by spec-1-2's frozen Never boundary and belongs to Story 1.3 (profile setup).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Add a render test for app/index.tsx's cold-start redirect (existing session -> /(tabs)/index vs. no session -> /(auth)/welcome).
  evidence: Verification-gap finding: no test renders or imports app/index.tsx, so a reverted or altered redirect target would ship undetected. Lower risk than the welcome.tsx/sign-in.tsx/profile.tsx gaps (single conditional, no branch logic) — reviewer's own suggested disposition was defer rather than patch.
