---
title: 'Redesign v2 Phase 0: design system v2'
type: 'refactor'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
baseline_commit: '6501f504b2d58a33c9e99e2663f7ad2843a53227'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app's look (stone-gray palette, Fraunces display type, oxblood accent) isn't the refined, fashion-literate feel the user wants. Every later redesign phase needs a shared foundation first: tokens, fonts and base components.

**Approach:** Put the user-approved v2 direction (mockup: https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj) into the tokens and base components, so every existing screen re-tones app-wide without any layout change. Layout and screen work belongs to Phases 1–7.

**Decisions (user-locked):**
- **Palette:** Aesop cream, pure monochrome, no accent color.
  - Light: base `#F6F4EE`, raised `#FFFDF8`, tile `#ECE8DF`, ink `#252220`, ink-secondary `#766E64`, hairline `#E4DFD6`.
  - Dark: base `#1A1816`, raised `#24211E`, tile `#2A2622`, ink `#EDE8DF`, ink-secondary `#A39B90`, hairline `#35302B`.
- **Corners are hybrid:** controls are square (2px) and photos and sheets are soft (16px).
- **Newsreader** replaces Fraunces for display and title. Montserrat stays as the sans.
- **The tab bar keeps its current floating-pill structure** and is only re-toned. Its center "+" becomes ink instead of oxblood.

## Boundaries & Constraints

**Always:**
- Text meets WCAG AA (4.5:1) on `surface-base` and `surface-raised` in both modes. `surface-tile` holds photography only and never text.
- Light destructive becomes `#B91C1C`, because `#DC2626` measures only 4.39:1 on the cream.
- Inverse text on an ink fill uses `surface-base` in both modes.
- `tailwind.config.js` and `lib/theme/colors.ts` stay identical, with a test that enforces it.
- State is shown by fill vs outline and by weight, never by color.
- Custom fonts keep scaling manually with Dynamic Type, as `Text` does today.

**Never:**
- No screen layout changes. Grids, headers and screen structure are later phases.
- No new accent or chromatic color.
- No change to the tab bar's structure or animation.
- No native-rebuild-only dependency. `@expo-google-fonts/newsreader` loads at runtime through `useFonts`.
- Don't touch EXPERIENCE.md.

</frozen-after-approval>

## Code Map

- `lib/theme/colors.ts`: new palette. Remove `accent`, add `surfaceTile`, and set dark `surfaceRaised` to `#24211E` (it's `#000000` today). This file is consumed by `navigationTheme.ts`, `TabBarButton`, `BackHeader` and `app/fit/[id].tsx`.
- `tailwind.config.js`: mirror `colors.ts`. Remove `accent`/`accentDark` and add `surface.tile`/`tileDark`. `borderRadius.sm` goes from `8px` to `2px`, which squares every existing input, chip and button through the 24 current `rounded-sm` uses. `md` (12) and `lg` (16) stay the same.
- `lib/theme/fonts.ts`: `appFonts` gets `Newsreader_400Regular`, `Newsreader_500Medium` and `Newsreader_400Regular_Italic` (verify the export names after install), and drops Fraunces.
  - `typeScale`: `display` becomes Newsreader 400 at 36/40 with letterSpacing -0.4, and `title` becomes Newsreader 400 at 24/30.
  - `body`, `label` and `meta` are unchanged.
  - New `caption` role: Montserrat 500 at 11/14, letterSpacing 1.5, uppercase. It's for chips, button labels and tracked labels.
- `components/ui/Text.tsx`: apply the optional `letterSpacing`/`textTransform` from `typeScale`, with letterSpacing scaled by the font scale.
- `components/ui/Button.tsx`: primary is an `ink-primary` fill with `surface-base` text in both modes (fixing today's dark-mode white-on-light). Secondary is an ink outline. The label uses the `caption` variant. Minimum height 48, `rounded-sm`.
- `components/wardrobe/CategoryFilterChips.tsx` and `components/fits/FitsFilterChips.tsx`: labels move to `caption`, and selected text becomes `text-surface-base dark:text-surface-baseDark`. Otherwise these stay as they are.
- `components/navigation/AddItemTabButton.tsx`, `components/ui/CirclePlusButton.tsx`: the fill becomes `inkPrimary` and the plus becomes `surfaceBase` for the active scheme.
- `components/navigation/PillGlassBackground.tsx`, `AnimatedActiveIndicator.tsx`: re-tone the hardcoded rgba tints to the new palette (raised/base and ink). The structure is unchanged.
- `app/fit/[id].tsx:413`, `app/item/[id].tsx:252` (`text-accent`) → `text-ink-primary`. `components/fitBuilder/TemplatePicker.tsx:125` (`bg-accent`) → `bg-ink-primary`.
- `app.json` splash `backgroundColor` becomes `#F6F4EE`. This is native, so it only takes effect on the next dev-client build.
- DESIGN.md: rewrite the frontmatter tokens and the Colors, Typography, Shapes and Components prose for v2. Keep the Fit detail pattern line from Story 4.3.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/themeTokens.test.ts`: test first.
  - `colors.ts` and the tailwind palette agree token by token in both modes.
  - AA contrast for ink, ink-secondary and destructive on base and raised, plus inverse-on-ink, in both modes.
  - No `accent` token exists.
  - A source scan of `app/` and `components/` finds no `accent` className or `colors.*.accent` use.
- [x] `__tests__/typography.test.ts`: test first.
  - Every `typeScale` fontFamily is a key of `appFonts`.
  - `display` and `title` are Newsreader.
  - `caption` renders uppercase with letterSpacing scaled by the font scale.
- [x] `__tests__/button.test.tsx`: test first. Primary is an ink fill with inverse text, secondary is an outline, the label uses caption, and the loading/disabled behavior is unchanged.
- [x] Extend `__tests__/categoryFilterChips.test.tsx` and `__tests__/fitsFilterChips.test.tsx`: the selected chip label is readable (inverse class) and uses caption.
- [x] `__tests__/addItemTabButton.test.tsx`: the circle fill equals `colors.<scheme>.inkPrimary`.
- [x] Install `@expo-google-fonts/newsreader`, remove `@expo-google-fonts/fraunces`, then implement `colors.ts`, `tailwind.config.js`, `fonts.ts` and `Text.tsx`.
- [x] Implement `Button`, the chips, `AddItemTabButton`, `CirclePlusButton`, `PillGlassBackground`, `AnimatedActiveIndicator`, the three `accent` call sites, and `app.json`.
- [x] Rewrite DESIGN.md for v2.

**Acceptance Criteria:**
- Given any existing screen, when it renders in light or dark mode, then it shows the v2 palette and fonts with no leftover oxblood, stone gray or Fraunces, and its layout is unchanged.
- Given the tab bar, then it has the same pill structure and animation, and its "+" circle is ink.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | blind, edge | Photo surfaces on `rounded-sm` went square (2px) | medium | patch | The grep found 5 photo/placeholder uses (WardrobeGridCell:34, WardrobeGridSkeleton:20, FitItemsList:48, item/[id]:210, CameraFilmstrip:46). The frozen intent sets photos at 16px, and the Code Map wrongly counted all 24 uses as controls. The fix is a class swap to `rounded-lg`. |
| 2 | blind, edge | `typography.test` restores its spy inline after assertions | low | patch | If an assertion fails, `getFontScale` stays mocked. The fix is `afterEach(restoreAllMocks)`. |
| 3 | verif-gap | Button spinner inverse color not asserted | medium | patch | Pre-verified; the test never reads `color` or mocks the scheme. |
| 4 | verif-gap, blind | "+" glyph color and `CirclePlusButton` have no test | medium | patch | Pre-verified; no test reads the `PlusIcon` color, and no test file exists for `CirclePlusButton`. |
| 5 | blind | `CategoryPicker` selected-label change has no test | low | patch | Confirmed by grep. The fix is a one-assertion test. |
| 6 | verif-gap | Save Fit check icon color is not asserted | medium | defer | Pre-verified; reviewer disposition was defer. |
| 7 | verif-gap | Detail display-name className is not asserted | medium | defer | Pre-verified; reviewer disposition was defer. |
| 8 | blind, edge, verif-gap | Tab-bar rgba tints are hand copies of the palette | low | reject | The Code Map chose hardcoded re-toned rgba values. Drift only matters when the palette changes, and fixing it means adding a helper. |
| 9 | edge, blind | No dark splash variant | medium | defer | Real, but it predates this change (the old light and dark splash colors also differed). |
| 10 | edge | caption plus min-h-12 resize Buttons and chips, so "layout" changes | false | reject | The intent's Never clause defines layout as grids, headers and screen structure. Label type and the 48pt height are the locked component treatment. |
| 11 | blind | `surface-tile` is unused, and FitsGridCell has a light/dark bg mismatch | low | defer | Applying the photo-well treatment is screen work, which the intent assigns to Phases 1–7. The mismatch predates this change. |
| 12 | blind | Hand-styled tracked labels do not use `caption` | low | defer | They predate this change and are screen-level restyling. |
| 13 | blind | DESIGN.md's Story 4.3 paragraph is stale | false | reject | The Code Map says to keep that line. It describes the screen as shipped and is still accurate. |
| 14 | blind | EXPERIENCE.md still says Cormorant | low | defer | The intent says not to touch EXPERIENCE.md. |
| 15 | blind | Non-text contrast of the hairline chip outline is about 1.2:1 | medium | defer | It predates this change: the old palette gave the same ratio. |
| 16 | blind | Nothing enforces the "no text on surface-tile" rule | false | reject | No code uses `surface-tile` yet, so no text can sit on it. |
| 17 | blind | Callers must compute the inverse icon color themselves | low | reject | The current code is correct. The fix would add a Button API; this is noted with deferred item 6. |
| 18 | blind | Newsreader 500 and italic are loaded but unused | false | reject | The Code Map requires both fonts. |
| 19 | blind | The accent scan has blind spots (lib/, bracket access, hex values) | low | reject | `colors.ts` is key-checked directly, and my manual grep found no old hex values. Widening the scan adds complexity for an unlikely regression. |

## Verification

**Commands:**
- `npm run test`: all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: clean.

**Manual checks:**
- On a device, tour every tab plus item detail, Fit detail, profile, sign-in and the builder in both color schemes. Look for unreadable text and any leftover oxblood.
