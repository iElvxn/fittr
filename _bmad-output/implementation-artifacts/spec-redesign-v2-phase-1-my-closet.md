---
title: 'Redesign v2 Phase 1: My Closet'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
baseline_commit: '56c4779e22d2f6f993d748754030efe851f604d8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** My Closet is still a plain square 3-column grid with a small header. It has none of the Pinterest, Depop or Aesop feel the redesign is for, and it offers no way to find a piece in a large closet.

**Approach:** Rebuild the Wardrobe tab to match the approved mockup (P1 artboards, https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). It uses the Phase 0 tokens and components.

**Decisions (user-locked):**
- **Grid:** a 3-column masonry.
  - Tiles are soft `surface-tile`, `rounded-lg`, with the cutout contained inside.
  - Tile height follows the cutout's aspect ratio, **measured on the device** with no database change. A tile starts at a default shape for its category, then snaps to the real shape when its thumbnail loads. Measured sizes are cached per URL. Extreme shapes are clamped.
  - Under each tile sit two lines: line 1 is the name, or the category label if there's no name; line 2 is the brand, or the category if there's no brand.
  - Closet tiles have no heart.
- **Header:**
  - Top: a `caption` count ("10 PIECES", "1 PIECE").
  - Below: a `display` "My Closet", with the existing `CirclePlusButton` on the right, as on My Fits.
- **Search:** a square field, "Search by name or brand". It filters on the device, is case-insensitive, and combines with the category chip.
- **Chips:** plural labels (All, Tops, Bottoms, Shoes, Outerwear, Accessories). They still scroll sideways.
- **States:**
  - Loading: a masonry skeleton in `surface-tile`.
  - Empty closet: *An empty closet.* in italic serif, then "Photograph a piece and Fittr cuts it out for you. Start with what you wear most." and a primary "Add your first piece" button that goes to `/add-item`. The empty state has no search or chips.
  - No results: *Nothing matches "q".* for a search, or *No {chip label, lower case} yet.* for a chip. Then a secondary "Show everything" button that clears both the search and the chip.
  - Item added: the plain "Item added." text becomes an ink banner (`surface-base` text) floating above the tab bar with the text "Added to your closet". The existing 2.5s timer and route-param clearing stay.

## Boundaries & Constraints

**Always:**
- Build on Phase 0 tokens and type roles only (`caption`, `display`, `rounded-sm` controls, `rounded-lg` photos).
- Text meets WCAG AA. No text ever sits on `surface-tile`.
- Tile accessibility label: "name, brand, category", skipping any part that's missing.
- Keep the Wardrobe behaviors that already work: pull-to-refresh, refetch when the screen regains focus, the error notice with Retry, Sentry reporting, and a placeholder tile when a thumbnail URL fails.

**Never:**
- Don't change the Fit builder's `CatalogSheet`. It keeps the square `WardrobeGridCell` until Phase 7. The plural chip labels will show there too, which is intended.
- No change to the tab bar, item detail, or add-item.
- No server-side search, and no search on color.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Search hit | "coat", chip All | only items whose name or brand contains "coat" (case-insensitive) | N/A |
| Search + chip | "a", chip Shoes | shoes whose name or brand contains "a" | N/A |
| Whitespace query | "   " | treated as empty; all items | N/A |
| No match | "silk" | *Nothing matches "silk".* + Show everything → clears both, full grid | N/A |
| Empty chip | Accessories, no accessories | *No accessories yet.* + Show everything | N/A |
| No name, no brand | bottom item | line 1 "Bottom", no line 2 (no duplicate) | N/A |
| Missing thumb URL | url null | tile keeps a default aspect, placeholder fill | already Sentry-reported |

</frozen-after-approval>

## Code Map

- `app/(tabs)/wardrobe.tsx`: the screen. Replace the `FlatList` grid with a 3-column masonry. Keep the ack param logic, focus refetch, error, empty and refresh flows, and `useThumbnailUrls` over the unfiltered list.
- Masonry: add `@shopify/flash-list` v2 with `npx expo install`. It's pure JS on the New Architecture, so no dev-client rebuild is needed. Use the `masonry` prop with `numColumns={3}` and keep `testID="wardrobe-grid"`.
- Grid metrics: gutter 16, column gap 8, row gap 14.
- `components/wardrobe/ClosetTile.tsx` (new): the tile plus the two text lines (name `meta` `ink-primary`; second line `caption` `ink-secondary`; both `numberOfLines={1}`). `testID`s: `wardrobe-thumbnail-image` and `wardrobe-thumbnail-fallback`.
- `components/wardrobe/WardrobeGridCell.tsx`: leave it alone; `CatalogSheet` still uses it.
- `components/wardrobe/ClosetSearchField.tsx` (new):
  - 44pt tall, `rounded-sm`, `surface-raised`, hairline border.
  - A new `components/ui/icons/SearchIcon.tsx` (same style as the other icons in `components/ui/icons/`).
  - A clear button using the existing `CloseIcon`, labelled "Clear search".
  - `returnKeyType="search"`. The keyboard dismisses when the grid is dragged.
- `lib/wardrobe/listItems.ts`: add a pure `searchItems(items, query)` next to `filterByCategory`.
- Tile aspect ratios:
  - Cutouts are already trimmed to the garment (`lib/wardrobe/processImage.ts:35`, `trim: true`).
  - Read each thumbnail's size from expo-image's `onLoad` (`source.width`/`height`) and keep it in a URL → aspect cache at module level, so it survives remounts.
  - Clamp the aspect ratio to 0.5–1.6 (width ÷ height).
  - Category defaults until the image loads: outerwear 0.75, top 0.85, bottom 0.6, shoes 1.4, accessory 1.0.
- `components/wardrobe/CategoryFilterChips.tsx`: add a plural label map. `CATEGORY_OPTIONS` stays singular because add-item uses it.
- `components/wardrobe/WardrobeGridSkeleton.tsx`: only Wardrobe uses it. Rewrite it as a 3-column masonry of `surface-tile` blocks with text bars.
- `lib/theme/tabBar.ts` `useTabBarClearance`: the banner sits this far from the bottom, and the grid's bottom padding uses it too.
- Tests to update: `__tests__/wardrobeGrid.test.tsx` (ack text, empty copy, the "items" count, the "No items in this category." copy) and `__tests__/categoryFilterChips.test.tsx` (the labels).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/wardrobeSearch.test.ts`: tests first for `searchItems`, covering the matrix rows (case, whitespace, brand, null name or brand).
- [x] `__tests__/closetTile.test.tsx`: tests first for the two text lines, the no-duplicate rule, the a11y label and the placeholder.
- [x] `__tests__/wardrobeGrid.test.tsx`: update it and add header count, search and chip, no-results with Show everything, empty-state button navigation, and the ack banner.
- [x] `__tests__/categoryFilterChips.test.tsx`: plural labels.
- [x] Implement `searchItems`, `SearchIcon`, `ClosetSearchField`, `ClosetTile`, the skeleton, the chip labels, then `wardrobe.tsx` with FlashList masonry and the measured tile heights. The tile tests cover the category default and the clamp.

**Acceptance Criteria:**
- Given a populated closet, when My Closet opens in light or dark mode, then it matches the P1 mockup's structure: header count and title with "+", search, chips, and a 3-column masonry of soft tiles with the two text lines.
- Given the Fit builder's catalog sheet, when it opens, then its grid is unchanged apart from the plural chip labels.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Note: the first blind and edge-case review runs stalled (no progress for 600s) and were relaunched once; the triage below uses the relaunched runs.

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | blind, edge | The aspect cache is keyed by the signed URL | medium | patch | The `useThumbnailUrls` key is the sorted path list, so adding or deleting a piece re-signs every URL, and `staleTime` re-signs about hourly. Every tile then loses its measurement and jumps, and the Map never shrinks. Keying by `thumb_path` keeps "cached per image", which is the frozen intent's purpose. |
| 2 | edge | A late `onLoad` on a recycled tile caches the wrong shape | low | patch | `handleLoad` closes over the current URL, so an in-flight load from the previous image lands under the new key. The fix is a one-line URL guard. |
| 3 | verif-gap | No test for a recycled tile getting a new URL | medium | patch | Pre-verified; every test uses a single URL or a fresh mount. |
| 4 | blind, edge | The ack can confirm a piece hidden by an active chip or search, including after the closet was emptied with a filter still set | medium | patch | The chip and query state persist across `dismissTo`, and the chips are hidden in the empty state, so the filter can't be cleared there. The fix is to reset both when the ack arrives. |
| 5 | blind, verif-gap | The header caption is missing while loading, so the title jumps; its absence is also untested | low | patch | It renders only when `isReady`. Users hit this on every cold load, and the fix is trivial. |
| 6 | blind | `extraData` is a new object every render | low | patch | Every keystroke re-renders every tile; the fix is `useMemo`. |
| 7 | verif-gap | Late signed URLs reaching rendered tiles is untested | medium | patch | Pre-verified; drop the test if FlashList under Jest can't make it fail. |
| 8 | blind | Stale `CATEGORY_OPTIONS` comment | low | patch | Confirmed at `lib/wardrobe/addItem.ts:11`; the fix is a comment change. |
| 9 | blind | "Nothing matches" doesn't mention the active chip | low | reject | The frozen intent fixes that copy. |
| 10 | blind | Search misses curly apostrophes and accents | low | reject | iOS disables smart quotes when autocorrect is off, which the field sets. Accent folding adds complexity for a rare case. |
| 11 | blind | A broken thumbnail leaves an empty well | false | reject | The fallback is also an empty well of the same color, so the result looks identical. |
| 12 | blind | Result changes aren't announced to screen readers | low | reject | The old screen didn't announce them either, and fixing it adds a live region plus a filtered count. |
| 13 | blind, verif-gap | CatalogSheet mixes plural chips with v1 copy | false | reject | The frozen intent says CatalogSheet keeps its grid until Phase 7 and the plural labels there are intended. |
| 14 | blind | Italic font name hard-coded in `wardrobe.tsx` | low | reject | Fixing it means a new type role; worth considering when a second screen needs italic. |
| 15 | blind | The Jest mock depends on FlashList's internal file path | low | reject | FlashList is pinned at exactly 2.0.2, and a moved path fails loudly in every grid test. |
| 16 | blind, edge | No pull-to-refresh on the empty and no-results screens | low | defer | This predates Phase 1: the old empty and no-results screens were plain views too. |
| 17 | blind | The ack banner overlaps the last row | false | reject | It's a floating toast shown for 2.5s, by design. |

## Verification

**Commands:**
- `npm run test`: all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: clean.

**Manual checks:**
- On a device with 30+ items, check light and dark mode:
  - scrolling is smooth,
  - search, chips and Show everything work,
  - the empty, loading, ack and error states each appear correctly,
  - text stays readable at the largest Dynamic Type size.
