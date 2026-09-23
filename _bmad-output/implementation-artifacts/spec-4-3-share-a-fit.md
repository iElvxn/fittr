---
title: 'Share a Fit (Story 4.3) + Fit detail redesign'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '778243f4970bc5ab8e361de66f4cc0d3ffe70ce8'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** You can't get a Fit's collage out of the app, so there's no way to send an outfit to a friend or save it to Photos. The Fit detail screen (`app/fit/[id].tsx`), where Share would go, also looks unrefined: the name sits above the image, which goes against DESIGN.md's "photo dominates the top" rule, the screen is split 2:1 into a cramped image area and a separate scroll area, and the action row is a set of unlabeled icons that users have to guess at.

**Approach:** Add Share. It downloads the Fit's already-rendered cover (`cover_path`, a signed URL from the private `wardrobe` bucket) to a `.png` file in the app's cache folder, then passes that file to React Native's built-in `Share.share({ url })`, which opens the native iOS share sheet. No new native dependency is needed. The Fit detail screen is also redesigned to match fashion-app detail screens on Mobbin (Grailed, Zalando, lululemon and Whering all put Share at the top right; Zara and Grailed use an editorial image-first layout). The user asked for the redesign to cover only the surfaces this story touches.

**Decision (layout, chosen by the user): Editorial scroll.** One `ScrollView`, top to bottom: header with the back chevron on the left and the Share icon on the right → collage at full width (inset by the gutter) → Fit name in `display` → one uppercase tracked `meta` line (`N ITEMS · UPDATED SEP 18`; the item count is left out until it's known) → hairline-bordered action row, each action an icon with a tiny uppercase caption (FAVORITE / WEAR TODAY↔WORN TODAY / EDIT / DELETE), spaced evenly → `ITEMS` section using the existing `FitItemsList`. The user accepted the spec size (~1,900 tokens) as one spec.

## Boundaries & Constraints

**Always:** Share hands off only a fully downloaded file. The button is disabled until `coverUrl` resolves, and it's hidden for a zero-item Fit, whose cover would show items that no longer exist. The share file lives in `Paths.cache`, named `fit-<fitId>.png`, and is overwritten each time (`idempotent: true`). It is deleted on a best-effort basis after the share sheet closes. A user dismissing the sheet is not an error. Errors follow the screen's existing pattern: `no_connection` shows `NO_CONNECTION_MESSAGE`, and anything else shows `UNKNOWN_ERROR_MESSAGE` and is reported to Sentry. Share is disabled while a delete is in progress and does nothing on a second tap while a share is still preparing. Every touch target is at least 44×44pt. No accent color is used for state. Everything must work in dark mode.

**Never:** No custom share UI (EXPERIENCE.md requires the native sheet). No re-rendering of the collage. No new npm or native packages (`expo-sharing` would need a dev-client rebuild). The signed URL is never shared, only the local file. Don't restyle the My Fits grid, the Wardrobe, the builder or shared components beyond adding a new `ShareIcon` and an optional right-side slot on `BackHeader`. The rest of the app's redesign is deferred (see `deferred-work.md`). Favorite, Wear-today, Edit and Delete keep their current behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Share happy path | tap Share, cover URL resolved | file downloaded → `Share.share({ url: file.uri })` → sheet opens | N/A |
| User dismisses sheet | `dismissedAction` | no message; temp file cleaned up | N/A |
| Cover URL not yet resolved | `coverUrl === null` | Share button disabled | N/A |
| Zero live items | `isEmptyFit` | Share button hidden | N/A |
| Offline during download | download throws network error | `NO_CONNECTION_MESSAGE` shown, no sheet | not sent to Sentry |
| Download non-2xx / other failure | throws | `UNKNOWN_ERROR_MESSAGE`, no sheet | Sentry |
| Double tap | tap while preparing | second tap ignored | N/A |

</frozen-after-approval>

## Code Map

- `app/fit/[id].tsx` -- the screen to redesign. Keep all handlers (`handleToggleFavorite`, `handleToggleWornToday`, `handleDelete`, the override-reset-during-render pattern) unchanged. Add `handleShare` with a `sharing` busy flag. Replace the fixed `flex: 2`/`flex: 1` split with a single `ScrollView`. The cover stays `contentFit="contain"` with no shadow, on `surface-raised`.
- `lib/fits/shareFit.ts` (new) -- `shareFitCover(fitId, coverUrl)`: `File.downloadFileAsync(coverUrl, new File(Paths.cache, \`fit-${fitId}.png\`), { idempotent: true })` → `Share.share({ url: file.uri })` → best-effort `file.delete()` in `finally`. Classifies download failures with `isNoConnectionError` into `FitError('no_connection')`, matching `toggleFavorite.ts`. Re-throws anything else unchanged.
- `components/ui/icons/ShareIcon.tsx` (new) -- iOS square-with-up-arrow, same `{ size, color }` signature, 24 viewBox and 1.75 stroke as `HeartIcon`.
- `components/ui/BackHeader.tsx` -- add an optional `right?: ReactNode` slot (`justify-between`). Existing callers are unaffected.
- `lib/theme/fonts.ts`, `tailwind.config.js`, `lib/theme/colors.ts` -- reuse the tokens as they are. No new tokens.
- `lib/wardrobe/thumbnailUrls.ts` -- already provides `coverUrl`. Reuse it; don't create a second signed URL.
- Tests: `__tests__/fitDetail.test.tsx` (extend; mock `@/lib/fits/shareFit`), `__tests__/shareFit.test.ts` (new; mock `expo-file-system` and `react-native`'s `Share`).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/shareFit.test.ts` -- test first -- download target path and `idempotent`, `Share.share` gets `{ url: file.uri }`, cleanup on success, dismiss and failure, no-connection classification, unknown re-throw, Share rejection propagates
- [x] `lib/fits/shareFit.ts` -- implement until tests pass
- [x] `__tests__/fitDetail.test.tsx` (extend) -- test first -- Share visible and enabled with cover, disabled without `coverUrl`, hidden for an empty Fit, calls `shareFitCover('fit-1', url)`, both error messages, Sentry only for unknown errors, double-tap guard. Update any existing layout-dependent assertions
- [x] `components/ui/icons/ShareIcon.tsx` -- new icon
- [x] `components/ui/BackHeader.tsx` -- `right` slot
- [x] `app/fit/[id].tsx` -- redesign per the chosen layout and wire Share
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md` -- update the Fit detail pattern line to match the shipped layout

**Acceptance Criteria:**
- Given a Fit's detail with a loaded cover, when I tap Share, then the iOS share sheet opens with the collage PNG.
- Given the share sheet, when I pick any destination, then it receives the fully downloaded PNG, never a URL or placeholder.
- Given VoiceOver, when I focus each action, then it reads a clear label ("Share Fit", "Add to favorites", …).

## Implementation Notes

- The user first approved each edit in chat, one task at a time (Tasks 1 and 2 shown in full before writing). Partway through they said "keep going and don't worry about telling me", so Tasks 3 to 7 were written without per-edit pauses.
- Test-first order held: `shareFit.test.ts` failed first on the missing module, and the 11 new `fitDetail.test.tsx` cases failed against the old screen for the right reasons (no Share control, captions or item-count meta) before any production code changed.
- `shareFitCover` adds a `fitId` check (`/^[A-Za-z0-9-]+$/`) that isn't in the Code Map. It's defense in depth, since `fitId` becomes part of a file path under `Paths.cache`. The check runs before any file-system or network access and has its own `it.each` test.
- The Share button also sets `accessibilityState.busy` while preparing and shows a spinner in place of the icon. Delete is disabled while a share is preparing, the mirror of Share being disabled during a delete.
- `FitAction` (icon plus caption) is defined at module scope, not inside `FitDetail`, so its component identity stays stable across renders. The caption scales by `PixelRatio.getFontScale()` like `Text` does, and `accessibilityLabel` carries the spoken name, so VoiceOver reads "Add to favorites", not the caption.
- Changed existing test: "shows the Fit's last-updated date" now matches with an end-anchored regex, because the meta line gains an `N items · ` prefix once the count is known. The item count and the date-only fallback each have their own new tests.
- `act(...)` warnings: `fitDetail.test.tsx` already logged 8 at baseline, all from older tests that don't wait for `getFitItems` to resolve. The new tests that assert synchronously were changed to wait for `fit-items-list` and emit none when run on their own. The older tests are unchanged, since they're outside this story's scope.
- DESIGN.md now documents the shipped Fit detail layout and the "state via glyph swap" convention (CalendarIcon→CheckIcon), which also closes Story 4.2's deferred DESIGN.md item.
- Verification, each command's exit code captured directly: `npm run test` exit 0 (422 passed, 11 skipped; the skipped suite is the Supabase RLS integration tests, which need live credentials). `npm run typecheck` exit 0, after fixing one mock-typing error in `shareFit.test.ts`. `npm run lint` exit 0.
- Not verified on a device or simulator in this environment: the real iOS share sheet receiving the PNG, dark mode, and VoiceOver. These are listed under manual checks.

## Spec Change Log

## Review Triage Log

Blind Hunter, Edge Case Hunter and Verification Gap reviewed the diff at baseline `778243f4970bc5ab8e361de66f4cc0d3ffe70ce8` in parallel. Findings are grouped by root cause below. The implementation was done inline rather than by a subagent, so patches were applied directly.

- **Native offline download errors aren't classified as `no_connection`** (all three layers). Verdict: `medium`. `expo-file-system` 57.0.6's `FileSystemDownload.swift:135` rejects with `UnableToDownloadException(localizedDescription)`, i.e. "Unable to download a file: The Internet connection appears to be offline." None of `isNoConnectionError`'s patterns match that, so a real offline share would show the generic error and report to Sentry. The old test used a fetch-style `TypeError` that this API never throws. Route: `patch`. Added a local `isDownloadConnectionError` covering the NSURLError offline/unreachable descriptions, plus `it.each` tests with the real native message shape.
- **The signed cover URL can be expired when Share is tapped** (blind-hunter, edge-case-hunter). Verdict: `medium`. The repo has no `focusManager`/`AppState` wiring (grep finds none), so `useThumbnailUrls` never re-signs while the screen stays mounted, for example after the app sits in the background overnight. The download then fails with a 403, which shows the generic error and reports to Sentry. Route: `patch`. `handleShare` refetches the URL when the query is stale (`staleTime` is set one minute short of expiry) and handles an offline refetch as `no_connection`. Three new tests.
- **Share is enabled before `isEmptyFit` is known** (blind-hunter, edge-case-hunter). Verdict: `low`. While `getFitItems` is still loading, a zero-item Fit's stale cover can be shared, which the "hidden for a zero-item Fit" rule is meant to prevent. The fix is a direct correction, so it isn't rejected. Route: `patch`. Share stays disabled until the count resolves and fails open if the count read errors (Story 3.4 precedent). Two new tests.
- **Captions truncate or overflow at large Dynamic Type sizes** (blind-hunter, edge-case-hunter). Verdict: `medium`. Four columns with `minWidth: 72` and `numberOfLines={1}` at a font scale of about 2 either clip "WORN TODAY" or push the row past the screen edge, which hurts accessibility users. `PixelRatio.getFontScale()` also doesn't re-render when the user changes font size. Route: `patch`. The actions are now equal `flex-1` columns, captions wrap to two centered lines, and scale comes from `useWindowDimensions().fontScale`.
- **Nothing tests that Delete is disabled while sharing** (verification-gap, pre-verified). Verdict: `low`. The `|| sharing` guard was deliberate but nothing protected it. Route: `patch`. Added a test.
- **DESIGN.md didn't match the shipped UI** (blind-hunter). Verdict: `low`. The example date had no year, and the doc said "all `ink-primary`" while the captions are `ink-secondary`. Route: `patch`. Corrected the doc.
- **A test name promised singular and plural** (blind-hunter). Verdict: `low`. Route: `patch`. Renamed it.
- **Caption font scaled twice (RN auto-scaling plus manual)** (blind-hunter). Verdict: `false`. The shared `Text` sets `allowFontScaling={false}` and scales manually, and `FitAction` follows that convention.
- **The double-tap guard races on React state** (blind-hunter). Verdict: `false`. Press is a discrete event, `setSharing(true)` runs synchronously before the first `await`, and React flushes discrete updates before the next event. The button's `disabled` prop blocks it as well.
- **Edit during a share unmounts the screen, so `setState` runs after unmount** (blind-hunter). Verdict: `false`. `router.push` keeps Fit detail mounted in the stack, and React 19 doesn't warn about updates after unmount anyway.
- **Hardcoded `.png` extension** (blind-hunter). Verdict: `false`. `uploadCover` always writes `cover-<ts>.png` with `contentType: 'image/png'`.
- **`Share.share({ url })` doesn't work on Android** (blind-hunter, edge-case-hunter). Verdict: `false`. The app is iOS-only (EXPERIENCE.md, `ActionSheetIOS` throughout), so that platform isn't reachable.
- **Shared `errorMessage` slot overwritten by concurrent actions** (edge-case-hunter). Verdict: `low`. This is the pre-existing pattern already rejected in Story 4.2's triage, and each action still reverts on its own. Route: reject (low, and the fix is a multi-slot error UI).
- **The shared filename is a UUID** (blind-hunter). Verdict: `low`. Cosmetic in AirDrop/Files, and a name slug adds sanitization complexity. Route: reject.
- **Date regex built without escaping** (blind-hunter). Verdict: `low`. `Intl` month/day/year output contains no regex metacharacters. Route: reject.
- **No tests for BackHeader's `right` slot, the absence of `selected` on Edit/Delete, or the share spinner** (blind-hunter). Verdict: `low`. Every Share test exercises the slot. The other two are cosmetic. Route: reject.
- **Share spinner uses the default color** (blind-hunter). Verdict: `low`. The iOS default gray reads fine in both themes and matches the existing Delete spinner. Route: reject.
- **Spec untracked and not in the diff** (blind-hunter). Verdict: `false`. The spec is deliberately kept out of the review diff. The workflow gives it only to the edge-case layer.
- **The temp file is deleted as soon as `Share.share` resolves, and a share target may still be reading it** (blind-hunter). Verdict: `maybe-false`. iOS's `completionWithItemsHandler` should fire after the activity finishes, but whether AirDrop or third-party extensions still hold the file needs an on-device check. If it happens, a transfer fails, which would be `medium`. Route: `defer`.
- **`supabase/.temp/` isn't in `.gitignore`** (blind-hunter). Verdict: `low`. Pre-existing and not caused by this story. Route: `defer`.

## Design Notes

Mobbin references: [Grailed](https://mobbin.com/screens/717b62d9-3768-4862-bdc1-461b08927dd6), [Zalando](https://mobbin.com/screens/1db4c36b-1a12-4e8a-92d4-57c30b3f146e), [lululemon](https://mobbin.com/screens/e9e1e37e-513a-4db9-91b5-99e5f3b46435) (Share at the top right), [Whering outfit detail](https://mobbin.com/screens/12e85047-e383-491a-9f6f-c03efecbffac) (action row directly under the collage), [Zara](https://mobbin.com/screens/f4e781c4-6db0-4176-b345-9f0eb156a8a5) (small uppercase editorial captions). RN's `Share.share({ url })` with a `file://` URL gives iOS a real image item, so Photos, Messages and AirDrop all receive the PNG.

## Verification

**Commands:**
- `npm run test` -- expected: all suites pass (RLS integration suite skipped without credentials, as before)
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean

**Manual checks:**
- On a device or simulator: open a Fit, tap Share, save to Photos, and confirm the full collage appears. Check both light and dark mode, and check with VoiceOver.
