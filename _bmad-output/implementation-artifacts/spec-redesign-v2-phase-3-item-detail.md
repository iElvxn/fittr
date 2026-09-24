---
title: 'Redesign v2 Phase 3: Item detail'
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
baseline_commit: 'a1ae7fe8a3fd44e5bb573bb2560eac75d49c8b97'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Item detail (`app/item/[id].tsx`) still has the pre-v2 look: a bare square photo, one uppercase meta line, and a bottom bar with a permanently disabled "Create Fit With This". Its "Fits" section always says "Not in any Fit yet.", even for pieces that are in Fits.

**Approach:** Rebuild the screen to the approved P3 mockup (P3Item, action-row layout, on https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). Use Phase 0 tokens and the Fit detail and Phase 1/2 patterns, and show the real Fits that use the piece.

**Decisions (user-approved):**
- **Photo:** a 4:5 `surface-tile` well, `rounded-lg`, full gutter width. The cutout is contained, never cropped. With no URL, the well is empty.
- **Heading:**
  - a `caption` category, shown only when the piece has a name (as today);
  - the `display` title: the name, or the category label when there's no name;
  - the brand in `body` `ink-secondary` when set.
- **Action row:** only Edit and Delete, styled like Fit detail's row (hairline top and bottom, icon over caption). Delete's icon and caption use the `destructive` token. There is no "Create a Fit with this" / "Style it" until the builder can start with a piece placed.
- **Details:** a caption label "Details", then hairline rows of label on the left and value on the right:
  - Color: a 12px swatch dot plus its name, or "Not set" in `ink-secondary`;
  - Category;
  - Brand, only when set;
  - Added: `created_at` as "Sep 12, 2026" (short month, day, year).
- **Notes:** a caption "Notes" and the note in `body`, only when notes exist.
- **Fits:**
  - The caption reads "In 1 Fit" / "In N Fits", with a horizontal strip of 3:4 tiles about 108pt wide. Each tile is filled with the Fit's `canvas_background_color` (`surface-raised` when null), shows the cover contained, and has the Fit name in serif below. Tapping a tile opens Fit detail.
  - With none, the caption reads "Fits", with *Not in a Fit yet.* in italic serif and "Put it on the canvas with a few other pieces and save the look." below.
  - If that read fails, the whole Fits section is hidden, never a false "Not in a Fit yet.".
- **Edit mode:**
  - The photo well shrinks to about 220pt tall.
  - Caption labels for Category, Color, Name, Brand and Notes.
  - Category as square `caption` chips (inked when selected), swatches with a ring when selected, hairline `rounded-sm` inputs.
  - Save (primary) and Cancel (secondary) are pinned to the bottom.
  - The shared `CategoryPicker` and `ColorSwatchPicker` get the new style, so the add-item batch review matches too.
- **Loading:** a skeleton (4:5 `surface-tile` block plus text bars) in place of the spinner.
- **Not found:** the copy stays "This item is no longer in your wardrobe.".

## Boundaries & Constraints

**Always:**
- Phase 0 tokens and type roles only. Light and dark. WCAG AA text. Touch targets ≥44pt.
- Keep today's behavior:
  - the edit fields, the save path (`updateWardrobeItem` + invalidate `['wardrobeItems', userId]`), and discard on cancel;
  - delete through the `ActionSheetIOS` confirm, then `router.back()`;
  - the no-connection vs unknown error copy, with `Sentry` for unknown errors;
  - the list-error state with Retry;
  - the item comes from the cached `useWardrobeItems` list.
- The Fits read is read-only: distinct `fit_id`s from `fit_items` where `item_id` = the piece. Joined on the device with the cached `useFits(userId)` list, so deleted Fits drop out, in that list's order. Its failure is reported to Sentry unless it's a no-connection error.

**Never:**
- No schema or RLS change, and no builder change.
- No change to Fit detail's behavior or look (only the refactor noted in the Code Map).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| In several Fits | fit_items rows for fits A, B (A twice) | "In 2 Fits", A and B tiles once each, in `useFits` order; tapping A pushes `/fit/[id]` with A | N/A |
| Fit deleted | fit_items row for a soft-deleted fit | not shown, not counted | N/A |
| In no Fit | no rows | "Fits" + *Not in a Fit yet.* + body | N/A |
| Fits read fails | query errors | Fits section hidden; rest of screen normal | Sentry unless no-connection |
| Bare piece | no name/brand/notes/color | title = category, no caption/brand line, Color "Not set", no Brand row, no Notes | N/A |
| Older piece | created_at 2025-03-04 | Added "Mar 4, 2025" | N/A |

</frozen-after-approval>

## Code Map

- `app/item/[id].tsx`: rebuild the view, edit, loading and not-found layouts. Move the Edit/Delete actions into the scrolling action row, with `errorMessage` rendered just below it. The pinned bottom area stays for edit mode only. Keep every handler (`handleSave`, `handleDelete`, `handleDeletePress`, cancel) and the `BackHeader`.
  - Italic serif: `style={{ fontFamily: 'Newsreader_400Regular_Italic' }}`, as in `app/(tabs)/wardrobe.tsx`.
  - Date: a module-level `Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })`.
  - The name comes from `colorLabel` in `components/wardrobe/ColorSwatchPicker.tsx`, and labels from `CATEGORY_LABELS` in `lib/wardrobe/addItem.ts`.
- `components/ui/DetailAction.tsx` (new): extract `FitAction` and its constants from `app/fit/[id].tsx:486-540` unchanged, and add an optional `tone?: 'destructive'` for the icon and caption color. `app/fit/[id].tsx` imports it; the rendered output there must stay identical.
- `lib/wardrobe/itemFits.ts` (new): `getItemFitIds(itemId): Promise<string[]>` (distinct, via `supabase.from('fit_items').select('fit_id').eq('item_id', itemId)`) and `useItemFitIds(itemId)`, with query key `['itemFits', itemId]`.
  - Classify no-connection errors the way `lib/fits/getFitItems.ts` does (`FitError` from `lib/fits/errors.ts`).
  - Don't use a `user_id` filter: `fit_items` RLS already scopes rows through `fits.user_id`.
- `components/wardrobe/ItemFitsStrip.tsx` (new): the horizontal strip.
  - Tiles are fixed 3:4, `contentFit="contain"`, filled like `components/fits/FitsGridCell.tsx`, with no heart.
  - Covers are signed through `useThumbnailUrls` from `lib/wardrobe/thumbnailUrls.ts`.
  - Tapping calls `router.push({ pathname: '/fit/[id]', params: { id } })`, and the accessibility label is the Fit name.
- `components/wardrobe/CategoryPicker.tsx`, `ColorSwatchPicker.tsx`: restyle only (square `caption` chips; a 30pt swatch with a two-ring selected state inside a 44pt target). Props, labels and the selected state stay the same; `BatchQueueRow` also uses them.
- `components/wardrobe/SectionLabel.tsx`: don't change it (Fit detail uses it). Item detail uses `Text variant="caption"` labels.
- Tests:
  - `__tests__/itemDetail.test.tsx`: keep the behavior tests; update the copy and structure (the "Fit placeholder" and loading-indicator tests).
  - `__tests__/categoryPicker.test.tsx`: update for the new style.
  - `__tests__/fitDetail.test.tsx`: must still pass unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/itemFits.test.ts`: tests first for `getItemFitIds`: distinct ids, the empty case, and no-connection vs other errors.
- [x] `__tests__/itemDetail.test.tsx`: tests first for:
  - the heading, including the bare-piece fallback;
  - the details rows and the Added date format;
  - notes shown or hidden;
  - the action row's Edit and Delete labels;
  - all matrix rows for the Fits section (count, order, dedupe, deleted Fit, none, failure hidden with Sentry);
  - the skeleton;
  - the edit mode's pinned Save and Cancel.

  Keep the existing save, cancel, delete and error tests.
- [x] `lib/wardrobe/itemFits.ts`, `components/ui/DetailAction.tsx` (and the `app/fit/[id].tsx` import swap), `components/wardrobe/ItemFitsStrip.tsx`, the picker restyles, then `app/item/[id].tsx`.

**Acceptance Criteria:**
- Given a piece, in light or dark mode, when Item detail opens, then it matches the P3Item artboard: the 4:5 tile photo, the caption/serif/brand heading, the Edit/Delete row, the Details rows, Notes and the Fits strip.
- Given edit mode, when the user saves, cancels or deletes, then the behavior and error copy match today's screen.
- Given Fit detail, when it renders after the `DetailAction` extraction, then its action row looks and behaves as before.

## Verification

**Commands:**
- `npm run test` (use `--maxWorkers=2` if the builder suites time out): all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: clean.

**Manual checks:**
- On a device, light and dark:
  - the cutout sits centered in the tile;
  - Fit tiles show their canvas color with no seam, and tapping one opens it;
  - Edit, Save, Cancel and Delete all work;
  - the add-item batch review pickers look right.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap | Delete's destructive tone untested | low | patch | Pre-verified: only role/name queries on Delete; dropping `tone` would pass every test. |
| 2 | verification-gap | Strip covers never rendered in tests | medium | patch | Pre-verified: all test fits have `cover_path: null`, so the `<Image>` branch never runs. |
| 3 | verification-gap, blind | `useItemFitIds` wiring (key, enabled, queryFn) untested | low | patch | Pre-verified: hook mocked in screen test, unit test covers only `getItemFitIds`. |
| 4 | blind, edge-case, verification-gap (other) | `['itemFits', itemId]` never refreshed; stale strip after editing a Fit opened from the strip | medium | patch | Item detail stays mounted under Fit detail/builder; nothing invalidates or refetches the key. Fix locally with a focus refetch (spec forbids builder/Fit detail changes). |
| 5 | blind, edge-case | `useFits` failure hides Fits section with no Sentry | low | patch | `app/item/[id].tsx:143` reads only `data`; direct fix mirrors `fits.tsx` reporting. Loading pop-in part rejected: section is at the bottom, below the fold. |
| 6 | blind, edge-case | Category chip hitSlops overlap when rows wrap | low | patch | 5 caption chips exceed 358pt so they wrap; 6pt row gap < 6+6pt slop. Direct fix: 12pt row gap. |
| 7 | blind | No index on `fit_items.item_id` | low | defer | Real at scale (seq scan + per-row RLS); intent forbids schema changes this phase. |
| 8 | blind, edge-case | Keyboard covers pinned Save/Cancel and lower inputs | medium | defer | Pre-existing: the old screen also pinned Save/Cancel outside the ScrollView with no keyboard avoidance. |
| 9 | blind | Color can't be cleared back to "Not set" | low | defer | Pre-existing: `ColorSwatchPicker` never had a deselect; now more visible with the "Not set" row. |
| 10 | blind | Delete sheet should warn when the piece is in Fits | low | reject | Intent keeps the existing confirm unchanged; adds a new branch and copy. |
| 11 | blind, edge-case | Strip uses non-reactive `PixelRatio.getFontScale()` | low | reject | Same as the shared `components/ui/Text.tsx` convention. |
| 12 | blind | Delete red on Item detail, ink on Fit detail | false | reject | Intent decision (destructive token on Item detail); the red is semantic, not decorative. |
| 13 | blind | Item edit labels (`Caption`) differ from batch review (`SectionLabel`) | low | reject | Intent keeps `SectionLabel` unchanged; the batch review restyle is its own phase. |
| 14 | blind | Misc: test name implies conditional year, no cover placeholder, `includes` vs `Set` | low | reject | Cosmetic/negligible; empty tile on a missing cover matches the intent's photo-well rule. |
| 15 | edge-case | Invalid `created_at` crashes `Intl.format` | false | reject | `0003_wardrobe_items.sql:43` `created_at timestamptz not null default now()`. |
| 16 | edge-case | Off-palette `color_hex` shows a raw hex as the name | low | reject | Pre-existing `colorLabel` fallback, same as the old meta line; the picker only offers palette colors. |
