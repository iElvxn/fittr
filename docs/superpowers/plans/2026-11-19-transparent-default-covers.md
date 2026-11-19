# Transparent Default Covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default-background Fits save a transparent cover so they fill their tile in both themes, and share as a solid image in the sharer's current theme color.

**Architecture:** `FitCanvas` drops its theme background while capturing when no color is chosen. `shareFitCover` gains a fill color and, when given one, paints it behind the downloaded cover with Skia before sharing. The Fit detail screen picks that color from the Fit and the current theme.

**Tech Stack:** React Native, NativeWind, react-native-view-shot 5.1.0, @shopify/react-native-skia 2.6.2, expo-file-system, Jest + React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-transparent-default-covers-design.md`

## Global Constraints

- Share fill colors: `#FFFDF8` light, `#24211E` dark, read from `colors.light.surfaceRaised` / `colors.dark.surfaceRaised` in `lib/theme/colors.ts`, never hard-coded.
- Fits with a chosen `canvas_background_color` are unchanged: still baked into the cover, still shared as downloaded.
- No change to tile layout, cropping or the 3:4 well. No second stored copy of a cover.
- TDD: each test is run red before the code that makes it pass.
- Execution: implemented directly, task by task. Before each code task, a table of the change, its reasoning, pros/cons and a best-practice verdict, then wait for approval.
- No commits unless the user asks.

## Review Focus

1. An old Fit whose cover already has a color baked in, shared with a fill: must share unchanged in look (fill only shows through transparent pixels). Test in Task 2.
2. Skia can't decode the downloaded file: must fail with an error the screen reports, and still delete the temp file, never share a blank image. Test in Task 2.
3. A Fit with a chosen background shared from dark mode: no fill, no Skia work. Tests in Tasks 2 and 3.
4. Theme changed while the detail screen is open: the fill follows the theme at the moment of sharing. Covered by Task 3 reading the scheme at render, which re-renders on theme change.
5. Capturing with a chosen color must still bake that color in. Test in Task 1.

---

### Task 1: Capture default-background covers without the theme color

**Files:**
- Modify: `components/fitBuilder/FitCanvas.tsx` (card `className` at about line 136)
- Test: `__tests__/fitCanvas.test.tsx` (`describe('FitCanvas custom background color')`)

**Interfaces:**
- Consumes: existing `capturing?: boolean` prop.
- Produces: nothing new; behavior only.

- [ ] **Step 1: Write the failing tests** in the existing describe block:
  - `it('drops the theme background while capturing a default-background Fit')`: `canvasBackgroundColor: null`, render with `capturing`; `expect(screen.getByTestId('fit-canvas').props.className ?? '').not.toMatch(/bg-surface-raised/)`. If NativeWind's jest setup strips `className`, assert the flattened `style.backgroundColor` is undefined instead, and adjust the next test the same way.
  - `it('keeps the theme background on screen when not capturing')`: same store, no `capturing`; expects `bg-surface-raised` present.
  - `it('keeps a chosen background while capturing')`: `canvasBackgroundColor: '#F6DADA'`, `capturing`; flattened `backgroundColor` is `'#F6DADA'`.
- [ ] **Step 2: Run and confirm red**
  Run: `npx jest __tests__/fitCanvas.test.tsx -t "background"`
  Expected: only the "drops the theme background" test FAILS, because the class is still there.
- [ ] **Step 3: Implement.** In `FitCanvas`, apply `bg-surface-raised dark:bg-surface-raisedDark` only when `!canvasBackgroundColor && !capturing`. Update the doc comment to say a default-background capture is transparent so the cover follows the theme.
- [ ] **Step 4: Run and confirm green**
  Run: `npx jest __tests__/fitCanvas.test.tsx`
  Expected: all pass.

### Task 2: Fill the background when sharing

**Files:**
- Modify: `lib/fits/shareFit.ts`
- Test: `__tests__/shareFit.test.ts`

**Interfaces:**
- Produces: `shareFitCover(fitId: string, coverUrl: string, fillColor: string | null): Promise<void>`. Task 3 calls it.

- [ ] **Step 1: Write the failing tests.** Mock `@shopify/react-native-skia` the way `__tests__/processImage.test.ts` does, with `Skia.Data.fromBytes`, `Skia.Image.MakeImageFromEncoded` (returning `{ width: () => 4, height: () => 3 }`), `Skia.Surface.Make` (returning a surface whose `getCanvas()` has `drawColor` and `drawImage` mocks, and `makeImageSnapshot()` returning `{ encodeToBytes: () => ENCODED }`), `Skia.Color: (c) => c`, and `ImageFormat: { PNG: 'png' }`. Give the downloaded file mock `arrayBuffer` and `write` mocks.
  - `it('paints the fill color behind the cover before sharing')`: `shareFitCover('fit-1', COVER_URL, '#24211E')`; `Surface.Make` called with `(4, 3)`; `drawColor` called with `'#24211E'` before `drawImage(image, 0, 0)`; the file's `write` called with `ENCODED`; `Share.share` called with `{ url: LOCAL_URI }` after the write.
  - `it('shares the download as-is when there is no fill color')`: `fillColor: null`; no Skia calls, no `write`, shares `LOCAL_URI`.
  - `it('fails without sharing, and still deletes the temp file, when the cover cannot be decoded')`: `MakeImageFromEncoded` returns `null`; the promise rejects; `Share.share` not called; `mockDelete` called.
  - Update the existing tests to pass `null` as the third argument.
- [ ] **Step 2: Run and confirm red**
  Run: `npx jest __tests__/shareFit.test.ts`
  Expected: the three new tests FAIL (no Skia calls, nothing rejects).
- [ ] **Step 3: Implement** `shareFitCover(fitId, coverUrl, fillColor)`. After the download and before `Share.share`, if `fillColor`: decode the file's bytes, `Surface.Make(width, height)`, `drawColor(Skia.Color(fillColor))`, `drawImage(image, 0, 0)`, snapshot, `encodeToBytes(ImageFormat.PNG)`, `file.write(bytes)`. A null image or surface throws a plain `Error`, which the screen reports as unknown. The fill sits inside the existing `try/finally`, so the temp file is always deleted. Update the doc comment: why the fill exists (a transparent image on an unknown background) and that solid covers are unchanged by it.
- [ ] **Step 4: Run and confirm green**
  Run: `npx jest __tests__/shareFit.test.ts`
  Expected: all pass.

### Task 3: Detail screen passes the fill color

**Files:**
- Modify: `app/fit/[id].tsx` (`handleShare`, about line 284)
- Test: `__tests__/fitDetail.test.tsx` (share tests near line 1003)

**Interfaces:**
- Consumes: `shareFitCover(fitId, coverUrl, fillColor)` from Task 2; `colors` from `lib/theme/colors.ts`; `useColorScheme` from `react-native`.

- [ ] **Step 1: Write the failing tests**
  - Update the existing share assertion to `toHaveBeenCalledWith('fit-1', SIGNED_COVER_URL, '#FFFDF8')` for the default-background fixture (light scheme in tests).
  - `it('shares a default-background Fit on the dark surface in dark mode')`: mock `useColorScheme` to return `'dark'`; expects `'#24211E'`.
  - `it('shares a Fit with a chosen background without a fill')`: fixture with `canvas_background_color: '#F6DADA'`; expects `null`.
- [ ] **Step 2: Run and confirm red**
  Run: `npx jest __tests__/fitDetail.test.tsx -t "share"`
  Expected: the three FAIL (called with two arguments).
- [ ] **Step 3: Implement.** In the screen, read `useColorScheme()`. In `handleShare`, pass `fit.canvas_background_color ? null : (scheme === 'dark' ? colors.dark.surfaceRaised : colors.light.surfaceRaised)`.
- [ ] **Step 4: Run and confirm green**
  Run: `npx jest __tests__/fitDetail.test.tsx`
  Expected: all pass.

### Task 4: Verify

- [ ] **Step 1: Full checks.** Run `npx tsc --noEmit`, `npm run lint`, `npx jest`. Expected: clean, all pass.
- [ ] **Step 2: Check every cover screen.** `grep -rn "cover_path\|cover_thumb_path" app components`; each screen that shows a cover must draw `surface-raised` (or the Fit's color) behind it. List any that don't; fixing one is a new step with its own test.
- [ ] **Step 3: Device checks** (the user, on the dev build):
  1. In light mode, save a new default-background Fit. Switch to dark mode: its tile, detail page and Home/Planner thumbnails fill the well with no narrow rectangle.
  2. The same in reverse: save in dark, view in light.
  3. Rounded corners show no light or dark edge in either mode.
  4. Share it in each mode to Messages: it arrives solid, light in light mode and dark in dark mode.
  5. A Blush Fit looks and shares as before.
- [ ] **Step 4: Record.** Any deferred item goes in `_bmad-output/implementation-artifacts/deferred-work.md`.
