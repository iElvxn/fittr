---
title: 'Add a Single Wardrobe Item'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '4155e979d639ae0cb6849bd3048eaedb054bc472'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Wardrobe tab is a placeholder ("Wardrobe is coming soon") with no way to add a clothing item, so users can't start building a digital wardrobe at all — every later Epic 2-5 feature depends on items existing.

**Approach:** Build a single-item capture flow (camera or library) that runs on-device background removal into a transparent cutout, lets the user confirm category and auto-detected color plus optional details, then uploads the cutout/thumbnail to Supabase Storage and inserts a row into a new `wardrobe_items` table.

## Boundaries & Constraints

**Always:** background removal runs on-device via a Vision-backed module, never a network API (NFR2); category is a manual choice from the fixed enum (top/bottom/shoes/outerwear/accessory), no AI detection; dominant color is auto-detected from the cutout's opaque pixels but user-editable before save; name/brand/notes stay optional; the original photo is discarded once the cutout is confirmed and never uploaded (NFR4); cutout+thumbnail upload to the existing `wardrobe` bucket at `{uid}/items/{itemId}/cutout.png` and `.../thumb.webp` (bucket and its per-folder RLS already exist from Story 1.3 — no Storage migration needed; `image/webp` is already in the bucket's allowed MIME types); the `itemId` is a client-generated uuid, generated before upload so the path exists ahead of the row insert; `wardrobe_items` RLS uses explicit per-operation policies scoped to `user_id = (select auth.uid())` (NFR5) — wrapped in a subquery per Supabase's RLS-performance guidance, unlike `profiles`' unwrapped form, since items are scanned per-row far more than the single-row `profiles` table — plus an index on `user_id` and a partial index on `(user_id) where deleted_at is null` for the filtered reads Story 2.3 will do; a no-connection failure on save is block-and-keep — "No connection — nothing was lost. Try again." with the cutout/fields intact and a retry action, no silent queue.

**Never:** batch/multi-select/rapid-camera capture (Story 2.2); a wardrobe grid, browse, or filter UI (Story 2.3) — after save, return to the Wardrobe tab (still its current placeholder) with a brief success acknowledgment only, no list/grid to build here; item detail, edit, or delete UI (Story 2.4); an `ImageStore` abstraction — that's NFR8, explicitly scoped to Epic 6 in the epics' NFR coverage table, so Storage calls go directly through the Supabase client, matching `lib/profile/avatar.ts`'s existing pattern; reprocessing a poor cutout — retake only; forking or extending `SignUpError` for wardrobe errors — it's auth-specific and already flagged for a future rename, so define a separate wardrobe-scoped error type instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path, camera | Take Photo → cutout generated → keep default category/color → Save | `wardrobe_items` row inserted, cutout+thumb uploaded, original photo discarded, success ack shown, back at Wardrobe tab | N/A |
| Happy path, library | Choose from Library → edit color, add name/brand → Save | Same as above with edited fields persisted | N/A |
| Poor cutout | Review screen, tap Retake | In-memory cutout/photo discarded, capture restarts from the same source; nothing uploaded or inserted yet | N/A |
| Background removal finds no subject | Photo has no detectable foreground | Inline error on the review screen, no cutout shown, Retake offered | "Couldn't find your item in that photo. Try again with better lighting or a plain background." |
| No connection at save | Save tapped while offline | No partial upload or insert; user stays on review screen with cutout/fields intact | "No connection — nothing was lost. Try again." + retry action |
| User backs out mid-flow | Dismiss add-item screen before Save | No Storage write, no row insert, no orphaned state | N/A |

</frozen-after-approval>

## Code Map

- `app/(tabs)/wardrobe.tsx` -- placeholder; add "Add" button + success ack on return.
- `app/add-item.tsx` (new) -- one modal screen, source choice → processing → review, mirroring `app/onboarding.tsx`'s single-screen-multi-step pattern (not a nested route stack).
- `app/_layout.tsx` -- existing root `Stack` (native-stack backed); register `add-item` as `<Stack.Screen name="add-item" options={{ presentation: 'modal' }} />` -- native modal presentation, not a JS bottom-sheet library.
- `lib/profile/avatar.ts` -- model for pick/upload shape (`pickAvatar`, `uploadAvatar`); `lib/wardrobe/*` follows this, adding capture + resize + background removal + color detection.
- `lib/auth/errors.ts` -- reuse `isNoConnectionError`; don't reuse `SignUpError` itself (see Boundaries).
- `supabase/migrations/0001_profiles.sql` -- pattern for `wardrobe_items`: per-operation RLS, `set_updated_at()` trigger (reusable as-is).
- `supabase/migrations/0002_avatar_storage.sql` -- `wardrobe` bucket's existing policies already cover `{uid}/items/{itemId}/...` — no new Storage migration needed.
- `supabase/tests/rls.test.ts` -- existing cross-user RLS test pattern to extend for `wardrobe_items`.
- `components/ui/Text.tsx`, `Button.tsx`, `lib/theme/colors.ts` -- existing primitives (Text: display/title/body/label/meta; Button: primary/secondary, fill-vs-outline) — no new primitives needed.
- `lib/analytics/posthog.ts` -- `trackSignedUp` is the pattern for a new `trackItemAdded(source, category)`.
- `package.json` -- have: `expo-image-picker`, `expo-image`, `expo-file-system`. Need: `expo-image-manipulator`; a Vision-backed removal package (`react-native-remove-background` fits the app's iOS 17+/EAS-dev-build setup, no custom native module needed); a color-extraction approach (alpha-aware, see Design Notes). `expo-camera` not needed — `launchCameraAsync` covers single-shot capture.
- `stores/` (new) -- first real Zustand consumer; holds in-progress photo/cutout/category/color/notes state across capture → review.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` -- add `expo-image-manipulator`, `react-native-remove-background` (or a verified equivalent), and the chosen color-extraction dependency -- prerequisite for every step below.
- [ ] `supabase/migrations/0003_wardrobe_items.sql` -- create `wardrobe_items` table (`category` as `text` + `check` constraint against the fixed enum, not a native Postgres enum type, for easier future extension) + per-operation RLS using `(select auth.uid())` + an index on `user_id` and a partial index on `(user_id) where deleted_at is null` + `updated_at` trigger reusing `set_updated_at()` -- mirrors `profiles`' RLS discipline with the RLS-performance fixes noted above.
- [ ] `lib/wardrobe/errors.ts` -- new `WardrobeItemError` (kind: `no_connection | processing_failed | unknown`), reusing `isNoConnectionError` -- keeps error handling consistent without forking `SignUpError`.
- [ ] `lib/wardrobe/capture.ts` -- `pickFromLibrary()` / `captureFromCamera()` via `expo-image-picker`, no aspect lock -- the two entry points from the source-choice action sheet.
- [ ] `lib/wardrobe/processImage.ts` -- resize (`expo-image-manipulator`) → background removal → dominant-color extraction from opaque pixels → thumbnail generation -- the on-device pipeline (NFR2).
- [ ] `lib/wardrobe/addItem.ts` -- `uploadItem(userId, itemId, cutoutUri, thumbUri)` + `insertWardrobeItem(...)`, mirroring `uploadAvatar`'s upload-then-write shape -- persists the confirmed item.
- [ ] `stores/wardrobeCapture.ts` -- Zustand store for in-progress capture/review state.
- [ ] `app/add-item.tsx` -- source choice (native action sheet: Take Photo / Choose from Library) → processing → review (cutout, category selector, color swatches, optional fields, Save/Retake) -- the AC's user-facing flow.
- [ ] `app/(tabs)/wardrobe.tsx` -- add the "Add" entry point and post-save acknowledgment.
- [ ] `app/_layout.tsx` -- register the modal route.
- [ ] `lib/analytics/posthog.ts` -- add `trackItemAdded(source, category)`.
- [ ] `supabase/tests/rls.test.ts` -- extend with a `wardrobe_items` cross-user SELECT isolation case.

**Acceptance Criteria:**
- Given a saved item, when a second signed-in user queries `wardrobe_items`, then RLS returns zero rows for the first user's item (NFR5).
- Given the review screen with a manually-edited color, when Save is confirmed, then the edited `color_hex` persists, not the auto-detected value.
- Given a save in progress, when the app is backgrounded and returns, then no duplicate row or duplicate Storage object is created (no double-submit).

## Implementation Notes

- `react-native-remove-background` is unpublished on npm (404'd, last seen unpublished 2025-10-26). Substituted `@six33/react-native-bg-removal` — same Vision API (`VNGenerateForegroundInstanceMaskRequest`, iOS 17+), on-device with no network fallback on that OS range, actively maintained (published Jan 2026). Pinned `@shopify/react-native-skia` to `2.6.2` (not npm's latest `2.11.2`) because that's the version `expo install --check` resolves for Expo SDK 57; all its peer deps (React 19, RN 0.86, worklets 0.10, reanimated 4.5) were already satisfied by the project.
- The chosen bg-removal package has no documented, stable error for "Vision found no foreground subject" (confirmed by reading its native Swift source, not just its README) — it can surface as one of a few internal messages depending on exact failure point. `processImage.ts` treats any `removeBackground()` failure as the matrix's "no subject found" outcome rather than pattern-matching on undocumented strings.
- `app.json` (not in the original Code Map): `expo-image-picker`'s plugin config only had `photosPermission`, not `cameraPermission` -- `captureFromCamera()` (`launchCameraAsync`) needs `NSCameraUsageDescription` on iOS or the app crashes on the permission prompt. Added `cameraPermission` and broadened `photosPermission`'s copy to cover wardrobe items, not just the avatar picker it was originally written for.
- Two bugs surfaced only by on-device manual testing (neither was, or could have been, caught by lint/typecheck/unit tests):
  1. **`app/add-item.tsx`**: firing `ActionSheetIOS.showActionSheetWithOptions` synchronously on mount raced this screen's own native modal-presentation animation -- the sheet attached to a view controller still mid-transition and never displayed, leaving only the blank content view visible. `InteractionManager.runAfterInteractions` (tried first) didn't help, since it tracks JS-thread/Animated-API activity, not native-stack's UIKit-driven transition. Fixed by waiting on native-stack's own `transitionEnd` event via `navigation.addListener` instead.
  2. **`lib/wardrobe/capture.ts`**: `captureFromCamera` called `launchCameraAsync` without ever requesting camera permission first. Unlike `launchImageLibraryAsync` (which prompts for photo-library access itself via `PHPickerViewController`), `launchCameraAsync` requires permission to already be granted and rejects with `MissingCameraPermissionException` -- with no system prompt ever shown -- if it isn't. This was 100% reproducible on every first camera attempt, unrelated to the `NSCameraUsageDescription` Info.plist fix above. Fixed by calling `ImagePicker.requestCameraPermissionsAsync()` before `launchCameraAsync()`, surfacing denial as a new `WardrobeItemError('permission_denied', ...)`.

## Spec Change Log

- 2026-09-14: Human renegotiated the frozen thumbnail path from `.../thumb.jpg` to `.../thumb.webp`. Reason: JPEG can't hold transparency, and the epic's grid UX ("thumbnails on a transparent background") needs it. WebP supports alpha, compresses smaller than PNG, and `image/webp` was already an allowed MIME type on the `wardrobe` bucket (`0002_avatar_storage.sql`) — no Storage migration needed either way.

## Review Triage Log

Four parallel layers ran against the diff since baseline: Blind Hunter (12 findings), Edge Case Hunter (11 findings), Verification Gap Reviewer (4 findings), and a security-focused pass (0 High/Medium, 3 Low). Overlapping findings from different layers are merged into one row below where they share a root cause.

- **`wardrobe_items` INSERT/UPDATE ownership has no negative test** (verification-gap) — `medium` — RLS policies are correct (independently confirmed by the security pass), but only cross-user *reads* are tested; a regression to the `WITH CHECK` clause would ship undetected. Route: `patch` — add a negative case to the existing describe block.
- **`addItem.ts` upsert-idempotency has no test** (verification-gap) — `medium` — mirrors `avatar.ts`'s pattern but lacks `avatar.test.ts`'s equivalent coverage; a regression would silently reintroduce the duplicate-row/duplicate-object failure mode the code exists to prevent. Route: `patch` — add `lib/wardrobe/addItem.test.ts`.
- **`extractDominantColor` has no test** (verification-gap + blind-hunter, same root cause) — `medium` — pure, deterministic, easily unit-testable; a channel-swap or alpha-threshold inversion would silently ship wrong colors for every item with nothing to catch it. Route: `patch` — export the function and add a focused unit test with a synthetic RGBA buffer.
- **`cutout_path`/`thumb_path` not DB-constrained to the owning `user_id`** (security pass) — `low` — not currently exploitable (Storage's own RLS re-derives the real path independent of this column), but a future feature trusting the column verbatim could leak. Route: `patch` — add a `CHECK` constraint deriving the expected path from `user_id`/`id`, since the fix is small and directly hardens something the human explicitly asked to prioritize.
- **Async capture pipeline has no cancellation guard** (blind-hunter) — `medium` — confirmed real: if the screen unmounts (user backs out) while `processWardrobePhoto` is still in flight, its eventual `setProcessed`/`setProcessingFailed` call still lands on the *global* Zustand store and can corrupt the next capture session's state. Route: `patch` — guard both calls behind a mounted ref in `add-item.tsx`.
- **Color swatch accessibility labels read raw hex** (blind-hunter) — `low` — confirmed: `accessibilityLabel={\`Color ${hex}\`}` reads as literal hex digits to VoiceOver instead of a color name. Route: `patch` — add a name lookup for the fixed swatch palette.
- **Save silently no-ops if the session expires mid-flow** (edge-case-hunter) — `low` — confirmed: `handleSave`'s guard clause returns early on missing `userId` with no user-facing feedback. Route: `patch` — show the existing generic error message specifically for this case.
- **Sequential upload can leave one orphaned Storage object on connection loss** (edge-case-hunter) — `medium` — confirmed against the frozen matrix's own literal claim ("No partial upload or insert" for the no-connection-at-save row): `uploadItem` uploads cutout then thumb sequentially, so a drop between the two calls does leave one object without its pair. A retry reconciles it (same `itemId`, `upsert: true`), but a user who never retries leaves an orphan. Route: `patch` — parallelize the two uploads and roll back (delete) any that succeeded if either fails, so the promised "no partial upload" holds even transiently.

- **ActionSheetIOS has no Android equivalent** (blind-hunter + edge-case-hunter, same root cause) — `false` — the app has no Android target at all (`app.json` has no `android` key anywhere; `expo-build-properties`' `deploymentTarget: "17.0"` and the EAS dev-build workflow are iOS-only throughout). Not a defect in this diff.
- **`KeyboardAvoidingView`'s Android behavior is `undefined`** (blind-hunter) — `false` — same reason: no Android target exists for this app.
- **Permission denial is indistinguishable from cancellation** (blind-hunter + edge-case-hunter, same root cause) — `false` — verified against `expo-image-picker`'s actual type surface (`ImagePickerErrorResult`): `launchCameraAsync`/`launchImageLibraryAsync` throw a distinct error on permission failure rather than resolving `{ canceled: true }`. `runCapture`'s existing `try/catch` already surfaces this as a visible error state with a Retake button, not a silent return.
- **No client-side file-size check before the bucket's 5MB limit** — `low`, rejected — plausible but rare for a single clothing-item cutout at 1500px; the fix (a distinct size-check + new error message) is more than a direct correction for how infrequently it would actually trigger.
- **Default category `'top'` could silently mis-categorize an item** (blind-hunter) — `false` — the frozen matrix's own happy-path row ("keep default category/color → Save") explicitly endorses saving with the default untouched; this is spec'd behavior, not a defect.
- **Intermediate temp files (working-resolution resize, cutout) are never explicitly deleted** (blind-hunter) — `low`, rejected — all writes go through `expo-image-manipulator`'s own cache dir or the bg-removal module's `NSTemporaryDirectory()`, both OS-managed and reclaimed under storage pressure; explicit lifecycle tracking across every pipeline stage is more than a direct correction for a self-mitigating concern.
- **`sprint-status.yaml` still reads `in-progress`, not `review`** (blind-hunter) — `false` — the workflow's own later steps own this transition; not a defect to patch out-of-band mid-review.
- **New native dependency undocumented** (blind-hunter) — `false` — the Implementation Notes section above (part of this same diff) already documents `@six33/react-native-bg-removal`'s platform support and maintenance status; the finding's premise is incorrect.
- **Two saves within the ack banner's 2.5s window could clear the second one's timer early** (edge-case-hunter) — `false` — the full capture→process→review→save cycle cannot realistically complete twice within 2.5 seconds; the code correctly assumes a situation it can't reach.
- **`itemAdded` param could resolve to `string[]`** (edge-case-hunter) — `false` — the only call site (`add-item.tsx`) always passes a single string via object-form params; nothing in this diff can produce an array value here.
- **Auto-detected color "overwrites" a prior manual pick after Retake** (edge-case-hunter) — `false` — a new cutout warrants fresh color detection; this is the correct behavior, not a defect, and the color remains user-editable per spec either way.
- **Orphaned Storage objects if the app is killed between a successful upload and the row insert** (edge-case-hunter) — `low`, rejected — rare (a sub-second kill window), low-impact (invisible unused objects in the user's own private folder), and matches an already-accepted class of gap elsewhere in this app (epic-1 retro's avatar-storage-cleanup item); full reconciliation is out of proportion to this story.
- **Retake double-tapped before the picker opens could launch two pickers** (edge-case-hunter) — `low`, rejected — the Retake button itself unmounts on the first tap (status flips to `idle`, which renders no button), leaving only a narrow same-tick race that iOS's own modal-presentation handling likely absorbs.
- **Canceling a Retake's re-opened picker dismisses the whole modal, discarding typed name/brand/notes** (edge-case-hunter) — `low`, rejected — consistent with the frozen matrix's own established "back out mid-flow → full dismiss" precedent elsewhere; no promise of field-preservation exists outside the specific no-connection-at-save retry case, and the sequence (type fields, retake, then cancel the reopened picker) is narrow.
- **RLS test's account-creation assertions sit outside the `try/finally`** (edge-case-hunter) — `low`, rejected — mirrors two pre-existing instances of the identical structure already in this file (the `profiles` and `wardrobe` storage tests), not a deviation introduced by this story; low real-world impact (a test-account leak in a non-production test project).
- **Client-generated `id` upsert-conflict could act as an existence oracle** (security pass) — `false` — requires guessing another user's UUIDv4, assumed unguessable per this review's own precedent.
- **No visible session guard on the `add-item` route** (security pass) — `false` — `handleSave` no-ops without a `userId` and any direct API call would be rejected by RLS server-side regardless; no exploit path exists.
- **Ack banner is a stringly-typed contract with no test on either side** (verification-gap) — `low`, rejected — a broken banner is visually obvious in routine manual QA; an end-to-end router-param test is disproportionate to this one-line contract.

## Design Notes

- `react-native-remove-background` (Vision's `VNGenerateForegroundInstanceMaskRequest`) needs a physical iOS 17+ device, matching the app's existing EAS dev-build workflow. Confirm current maintenance before adding; any comparable Expo-compatible Vision-wrapper is an acceptable substitute.
- Color extraction must ignore transparent cutout pixels — a generic RGB-only library may not honor alpha; verify against a real cutout, or sample opaque pixels directly if not.
- `add-item.tsx` as one screen with internal step state matches `onboarding.tsx`'s precedent and sets up Story 2.2 to reuse the same screen for batches.

## Verification

**Commands:**
- `npm test -- rls` -- expected: new `wardrobe_items` RLS case passes (or skips if Supabase env vars are unconfigured, matching existing tests).
- `npx tsc --noEmit` -- expected: no type errors.

**Manual checks (if no CLI):**
- On a physical iOS 17+ device via the EAS dev build: add one item by camera and one by library, confirm both cutouts, edit color on one, verify both rows and their Storage objects exist in the Supabase dashboard and the original photos are absent from Storage.
