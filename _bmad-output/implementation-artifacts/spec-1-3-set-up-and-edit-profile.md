---
title: 'Set Up and Edit Profile'
type: 'feature'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
baseline_commit: '8c27b4d39b8e216678de90e6df9b580accce3e12'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A new account lands in onboarding with only a system-generated placeholder display name (`"New Fittr user"`) and no avatar, and returning users have no way to change either from Profile — the placeholder is user-visible and there's no edit path anywhere in the app.

**Approach:** Build the real onboarding step (required display name, optional avatar picked from the photo library) and an inline edit mode on Profile for both fields at any time, backed by a new private `wardrobe` Storage bucket for avatar uploads.

## Boundaries & Constraints

**Always:** reuse the existing `profiles` row (Story 1.1) — only `UPDATE display_name`/`avatar_path`, never a new table; a picked avatar is held locally (preview only) until Continue/Save is pressed, then uploaded to `wardrobe/{auth.uid()}/avatar.jpg` with `upsert: true` (fixed filename, path-scoped RLS) as part of the same submit — never uploaded at pick time, since the fixed-filename overwrite makes an immediate upload unrecoverable on Cancel; validate display name non-empty after trim before allowing Continue/Save, mirroring `validateEmailSignUp`'s pattern; classify no-connection errors on save/upload with the existing `isNoConnectionError` pattern; leave `username` untouched — never surfaced or editable here.

**Never:** add camera capture for avatar (library picking only; camera is Epic 2 scope); add or touch any "onboarding complete"/resume-onboarding logic in `app/index.tsx` (tracked separately in `deferred-work.md`, not this story's AC); make the `wardrobe` bucket public; add any Storage DELETE policy (avatar changes overwrite via upsert); touch Wardrobe/Fits/Planner tabs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Onboarding, valid name, no avatar | Enter display name, tap Continue | `profiles.display_name` updated; lands on Home | N/A |
| Onboarding, empty name | Tap Continue with blank/whitespace-only field | Stays on screen | Inline "Enter a display name" message |
| Onboarding, avatar picked | Pick a library photo | Preview shown immediately from the local file; uploads to `wardrobe/{uid}/avatar.jpg` and `avatar_path` is set only when Continue is pressed | N/A |
| Onboarding/Profile save, no connection | Save while offline | No partial update | "Check your connection and try again," fields intact |
| Profile edit, change name/avatar | Tap Edit, change fields, Save | `profiles` row updates; view mode reflects new values | N/A |
| Profile edit, cancel | Tap Edit, pick a new photo, change name, tap Cancel | No Storage write and no `profiles` update ever sent; view mode shows the original name and avatar unchanged | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0002_avatar_storage.sql` -- new: `wardrobe` bucket (`public: false`) + `storage.objects` SELECT/INSERT/UPDATE policies scoped to `(storage.foldername(name))[1] = auth.uid()::text`.
- `package.json`, `app.json` -- add `expo-image-picker` dependency + plugin entry with a `photosPermission` string (iOS-only app today; no Android key to update). New native module requires a fresh EAS dev-build install, same as Google Sign-In's original constraint.
- `lib/profile/validation.ts` -- new: `validateDisplayName(name)` mirroring `validateEmailSignUp`'s return shape (`null` | `{message}`).
- `lib/profile/avatar.ts` -- new: `pickAvatar()` wraps `ImagePicker.launchImageLibraryAsync` (`allowsEditing: true, aspect: [1,1], quality: 0.7`, images only) returning a local URI or `{cancelled: true}` -- pick only, no upload; `uploadAvatar(userId, localUri)` uploads to `wardrobe/{userId}/avatar.jpg` with `upsert: true`, returns the stored path; classifies no-connection like `emailSignUp.ts`. Callers invoke `uploadAvatar` only from their Continue/Save handler, never from the picker callback.
- `lib/profile/avatarUrl.ts` -- new: `useAvatarUrl(avatarPath)` — a `useQuery` wrapping `supabase.storage.from('wardrobe').createSignedUrl(path, 3600)`, `enabled: Boolean(avatarPath)`. Bucket stays private (per epic's "all data private per-user"), so display always goes through a signed URL, never a public one.
- `lib/profile/updateProfile.ts` -- new: `updateProfile(userId, {displayName, avatarPath?})` -- one `supabase.from('profiles').update(...)` call, classifying no-connection.
- `app/onboarding.tsx` -- replace the placeholder: display-name `TextInput` (required), avatar picker button showing an immediate local-file preview (no upload yet), Continue uploads the picked avatar (if any) then calls `updateProfile`, then `router.replace('/(tabs)')`. Mirror `email-sign-up.tsx`'s layout/error-display pattern.
- `app/(tabs)/profile.tsx` -- add local edit-mode state: Edit button swaps the view (name + avatar) for a form (`TextInput` + avatar picker, pre-filled); picking a photo only previews it locally; Save uploads the picked avatar (if any) then calls `updateProfile`, invalidates `['profile', userId]` and `['avatarUrl', ...]`, and exits edit mode; Cancel resets all edit-session state (picked-avatar preview, field/connection errors) and exits edit mode with nothing written.
- `__tests__/emailSignUp.test.ts`, `__tests__/errors.test.ts`, `__tests__/profileSignOut.test.tsx` -- existing patterns to mirror (mocking `@/lib/supabase`, `expo-router`) for this story's new tests.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0002_avatar_storage.sql` -- create `wardrobe` bucket + per-user-prefix RLS policies (select/insert/update, no delete) -- required before any avatar upload can succeed under RLS
- [x] `package.json` + `app.json` -- add `expo-image-picker` + iOS `photosPermission` plugin entry -- needed for library-only avatar picking
- [x] `lib/profile/validation.ts` -- `validateDisplayName` -- required-field enforcement per AC
- [x] `lib/profile/avatar.ts` -- `pickAvatar`/`uploadAvatar` -- avatar capture + upload, no-connection classification
- [x] `lib/profile/avatarUrl.ts` -- `useAvatarUrl` -- signed-URL display for the private bucket
- [x] `lib/profile/updateProfile.ts` -- `updateProfile` -- single write path for both onboarding and edit
- [x] `app/onboarding.tsx` -- real onboarding form (display name required, avatar optional) -- closes the placeholder-onboarding gap
- [x] `app/(tabs)/profile.tsx` -- inline view/edit mode for display name + avatar -- per AC ("view and edit ... at any time")
- [x] Unit tests: `validateDisplayName`, `avatar.ts` (upload success/no-connection, mocking `expo-image-picker` + `@/lib/supabase`), `onboarding.tsx` (required-name gate, successful continue), `profile.tsx` edit mode (save/cancel) -- per the I/O matrix

**Acceptance Criteria:**
- Given I just signed up, when onboarding asks for a display name, then I must enter one before continuing
- Given onboarding, when I optionally pick a photo for my avatar, then it uploads to Supabase Storage under my user prefix and `avatar_path` is set
- Given I am signed in, when I open Profile, then I can view and edit my display name and avatar at any time

## Implementation Notes

Implemented directly task-by-task (no implementation subagent), with each task reviewed by the user before moving to the next, per the user's standing preference for incremental review.

Implementation details not pinned down by the spec, decided during coding:
- Avatar upload uses `expo-file-system`'s new `File` class (`new File(uri).arrayBuffer()`) to get upload bytes, rather than adding a `base64-arraybuffer` dependency -- SDK 57's `expo-file-system` already exposes this and it was already a project dependency.
- Avatar preview (both onboarding and Profile edit) renders the freshly-picked local `uri` immediately after picking, not a signed URL round-trip -- the local file is already valid and avoids waiting on the upload to complete before showing anything. Profile's existing (previously-saved) avatar still displays via `useAvatarUrl`'s signed URL, since only a freshly-picked file has a usable local `uri`.
- `SignUpError`/`isNoConnectionError` (from `lib/auth/errors.ts`) are reused for avatar-upload and profile-update failures rather than introducing a new error class, following the same reuse precedent Story 1.2 set for sign-in (a single shared error taxonomy rather than one class per feature).
- Profile's existing `profiles` query was widened from `select('display_name')` to `select('display_name, avatar_path')`; the pre-existing sign-out test still passes unmodified.

All three verification commands ran clean: `npm run lint`, `npm run typecheck`, `npm test` (64 passed, 1 pre-existing skip unrelated to this story -- the RLS integration test, which needs live Supabase credentials).

**Not verified in this session (needs a human on real hardware):** the new `expo-image-picker` native module requires a fresh EAS development-build install before the picker, upload, and signed-URL display can be exercised on-device -- this session made no build/device changes. Also unverified: whether the `0002_avatar_storage.sql` migration has been applied to the actual Supabase project (this session did not and cannot apply it).

**Review pass (three parallel layers: blind-hunter, edge-case-hunter, verification-gap):** found one genuine frozen-intent conflict (avatar upload firing immediately on pick made Profile-edit Cancel unable to revert the fixed-filename Storage overwrite) -- resolved by amending the frozen I/O matrix/Boundaries with the human's confirmation (see Spec Change Log) and redesigning both screens to defer the actual upload to Continue/Save, holding only a local preview until then. All other real findings were applied directly as patches: full `handleCancelEdit` state reset, `pickAvatar()` wrapped in try/catch, avatar-url query invalidation on save, a `staleTime` on the signed-URL query, accessibility labels on both avatar images, storage bucket `file_size_limit`/`allowed_mime_types`, idempotent (`drop policy if exists`) migration policies, a new `wardrobe` cross-user Storage RLS test, and new/extended unit tests (`updateProfile.test.ts`, an exactly-50-char boundary case, a non-null-avatar-path `useAvatarUrl` case, and an empty-name case in Profile edit mode). Two findings were rejected (a cold-start `userId`-undefined dead button, already an accepted pattern elsewhere in the codebase; a bucket-already-public precondition that cannot occur since this migration is the bucket's first creation). One was deferred (no avatar-removal UI -- out of scope per the frozen `Never` boundary's no-DELETE-policy rule). Full detail and evidence for every finding is in the Review Triage Log below.

Re-ran `npm run lint`, `npm run typecheck`, `npm test` after all patches: clean, 72 passed (2 skipped -- both live-Supabase-credential RLS tests, `profiles` and the new `wardrobe` case).

## Spec Change Log

- **Triggering finding:** the blind-hunter and verification-gap review layers independently flagged that uploading the avatar immediately on pick (as the original I/O matrix and Boundaries specified) makes Profile-edit Cancel unable to honor its own "no update sent; view mode shows prior values" guarantee — the fixed-filename `upsert: true` overwrite is unrecoverable once it happens, regardless of any local-state reset.
- **What was amended:** the "Onboarding, avatar picked" and "Profile edit, cancel" I/O matrix rows, and the avatar-related `Always` boundary, now specify that a picked avatar is held as a local preview only and uploaded to Storage exclusively as part of Continue/Save — never at pick time. Confirmed with the human (this is a genuine frozen-intent conflict, not a call the agent should make silently).
- **Known-bad state avoided:** a user who edits their Profile avatar and then taps Cancel would otherwise have already overwritten their real avatar file in Storage, with no way to recover the original image even though the UI implies nothing changed.
- **KEEP:** the upload/RLS mechanics themselves (`wardrobe/{uid}/avatar.jpg`, `upsert: true`, no DELETE policy) are unchanged and worked correctly — only the *timing* of the upload call moved, from the picker callback to the Continue/Save handler.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Avatar upload fires immediately on pick; Profile-edit Cancel can't revert the Storage overwrite despite the spec's own "no update sent" guarantee (blind-hunter, verification-gap "Other findings") | medium, bad_spec → resolved via Spec Change Log above | Confirmed: `uploadAvatar` was called inside `handlePickAvatar` in both screens, before Continue/Save. Root cause was in the frozen I/O matrix/Boundaries themselves (conflicting rows), confirmed with the human and amended; code re-derived to upload only at submit time. |
| Neither Continue nor Save was gated on `uploadingAvatar`, allowing submit to race an in-flight upload (blind-hunter, edge-case-hunter x2) | medium, patch | Confirmed: no `disabled`/loading check tied `uploadingAvatar` to the Continue/Save buttons. Resolved as a side effect of deferring upload to the submit handler itself — upload now runs synchronously within the same `submitting`/`saving`-guarded handler, so there is no longer a separate in-flight window to race. |
| A failed re-pick after an earlier successful pick left a stale `avatarPath`/`pendingAvatarPath` in state, silently saving the wrong avatar (edge-case-hunter x2) | medium, patch | Confirmed: the catch block in the old `handlePickAvatar` cleared the preview URI but not the previously-set path variable. Resolved by the same redesign — there is no longer an intermediate "uploaded path" to go stale; only a local URI is held until submit, and upload/failure is handled once, at submit time. |
| `pickAvatar()`'s own promise (not just `uploadAvatar`'s) was never wrapped in try/catch in either screen (edge-case-hunter x2) | low, patch | Confirmed: `const picked = await pickAvatar();` had no surrounding try/catch in either `onboarding.tsx` or `profile.tsx`. Fixed by wrapping the picker call itself. |
| `handleCancelEdit` only reset `isEditing`, leaving a stale avatar preview and stale connection/field-error banners visible after Cancel (edge-case-hunter x2) | medium, patch | Confirmed by reading the old handler: it set only `setIsEditing(false)`. Fixed to reset every edit-session field (preview URI, field error, connection error). |
| `lib/profile/updateProfile.ts` has no dedicated test; every test that touches it mocks it, so its real payload-building and no-connection classification never execute (verification-gap) | medium, patch | Pre-verified by the verification-gap layer (repo-wide grep confirmed no unmocked test exists). Added `__tests__/updateProfile.test.ts` mirroring `avatar.test.ts`'s pattern. |
| `lib/profile/avatarUrl.ts`'s `useAvatarUrl` is never exercised with a non-null avatar path in any test (verification-gap) | medium, patch | Pre-verified: the only fixture used in `profileEdit.test.tsx` has `avatar_path: null`. Added a fixture/test case with a non-null path and a mocked `createSignedUrl` resolving, asserting the image renders that URL. |
| New `wardrobe` Storage RLS policies (SELECT/INSERT/UPDATE) have zero automated coverage, not even a skipped one (verification-gap) | medium, patch | Pre-verified: repo-wide search found no reference to `storage.objects`/`wardrobe` in any test. Extended `supabase/tests/rls.test.ts` with a cross-user `wardrobe` case, following its existing two-admin-user pattern (skipped without live credentials, same as the existing `profiles` case). |
| `validateDisplayName.test.ts` never tests the exact 50-character boundary, only one-over (blind-hunter) | low, patch | Confirmed by reading the test file. Added an exactly-50-char case. |
| `profileEdit.test.tsx` never exercises the empty/whitespace-only display-name rejection in edit mode (blind-hunter) | low, patch | Confirmed by reading the test file — only `onboarding.test.tsx` covered this path. Added the equivalent case to `profileEdit.test.tsx`. |
| `wardrobe` bucket has no `file_size_limit`/`allowed_mime_types`, so nothing at the storage layer stops an oversized or non-image upload from a caller bypassing the app's own crop/compress step (blind-hunter) | medium, patch | Confirmed by reading the migration — the bucket insert set only `id`/`name`/`public`. Added `file_size_limit` and `allowed_mime_types` to the insert. |
| The three `create policy` statements have no idempotency guard, unlike the bucket insert's `on conflict do nothing` (blind-hunter) | low, patch | Confirmed inconsistency within the same file. Added `drop policy if exists` before each `create policy`, matching the bucket insert's own idempotent style. |
| `useAvatarUrl`'s signed URL has no refresh strategy before its 1-hour expiry for a long-mounted screen (edge-case-hunter) | low, patch | Plausible but narrow (requires the Profile tab to stay mounted unfocused for over an hour). Fix is a one-line `staleTime` addition with no new surface, so patched rather than rejected despite low severity. |
| No explicit cache invalidation ties a successful avatar re-upload to `useAvatarUrl`'s query, risking a stale cached image display after Profile edit (blind-hunter) | medium, patch | Confirmed: `handleSave` invalidated only `['profile', userId]`. Since `avatarUrl`'s query key never changes (fixed filename) but each `createSignedUrl` call returns a fresh token in the URL, invalidating it forces a genuinely new URL and a fresh image fetch. Added invalidation of the avatar-url query alongside the profile query. |
| Avatar `<Image>` in both screens has no `accessibilityLabel` (blind-hunter) | low, patch | Confirmed. Added `accessibilityLabel="Profile avatar"` to both. |
| No way to remove an avatar once set (blind-hunter) | low, defer | Not required by any AC, and the frozen `Never` boundary explicitly forbids a Storage DELETE policy, which a clean removal feature would need. Logged to `deferred-work.md` rather than built. |
| Continue/Save silently does nothing if pressed before `useSession` resolves a `userId` (blind-hunter, edge-case-hunter) | low, reject | Real but narrow: Onboarding is only reached post-sign-up (session already established by that point) and Profile is gated by the `(tabs)` layout's own session redirect, so the window where `userId` is genuinely undefined mid-interaction is a cold-start race already guarded identically elsewhere in the codebase (e.g. `emailSignUp.ts` call sites) without extra handling. Fix would add a loading/disabled state for a case unlikely to be hit in everyday use. |
| Bucket-already-exists-as-public precondition not handled by `on conflict do nothing` (edge-case-hunter) | false | This migration is the bucket's first-ever creation in this project — there is no prior state in which `wardrobe` already exists, so the precondition cannot occur here. |

## Design Notes

## Design Notes

Profile edit is inline (view/edit toggle within the existing `profile.tsx`), not a separate route: keeps footprint small and avoids restructuring the `(tabs)/profile` route into a folder just for a two-field form; matches the app's existing pattern of simple stateful screens over new navigation stacks for small forms.

The `wardrobe` bucket name (not `avatars`) matches the epic's own storage-path convention, since later epics reuse the same bucket for wardrobe item images.

Resuming onboarding after a mid-onboarding relaunch (Story 1.2's flagged residual risk) is deliberately out of scope here — see `deferred-work.md` — since it isn't one of this story's own acceptance criteria and its inclusion pushed the spec over the token budget.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all unit tests pass, including new onboarding/profile-edit/avatar cases

**Manual checks (if no CLI):**
- On a freshly rebuilt EAS dev build (required for the new `expo-image-picker` native module): complete onboarding with a display name and an avatar, confirm both persist to Profile; edit both from Profile and confirm the change sticks after a relaunch.
