---
title: 'Build a Fit on the Canvas'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
context: []
baseline_commit: 'd6599c2562a22d358a7d7437888fa17a765a599c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 2 lets users catalog wardrobe items, but there is no way to compose an outfit from them — the Fits tab is a "coming soon" placeholder.

**Approach:** Build the "New Fit" entry flow: a swipeable template carousel ("Top + Bottom + Shoes", "Layered Outerwear", or "Blank canvas") followed by a freeform canvas where items added from a category tray can be dragged, pinch-resized, rotated, and reordered. Unfilled template slots render as a ghost-silhouette placeholder with a "+" affordance. In-progress state lives in a Zustand store only; no preview, save, or persistence (that's Story 3.2).

## Boundaries & Constraints

**Always:** Reuse `useWardrobeItems`/`WardrobeItemCategory`/existing NativeWind tokens (`ink-primary`, `surface-base`) and UI primitives (`Text`, `Button`); selected item shown only via a solid 2px `ink-primary` outline (never shadow/scale); touch targets ≥44×44pt via `hitSlop`; Reduce Motion skips spring/easing and applies end states immediately; canvas item positions are percentages (0–1) of canvas width/height so they're device-size independent.

**Never:** No preview/save/persistence, no `fits`/`fit_items` migration, no `react-native-view-shot` (all Story 3.2). No long-press or swipe gestures (banned outside this canvas's drag/pinch/rotate). No landscape support. No tablet layout. No undo/redo, per-item duplicate/flip, or background picker (logged to `deferred-work.md`, not this story). No dark/colorful theme divergence — new screens use fittr's existing light `ink`/`surface` tokens and typography, not the colorful/dark palette of any UI reference used for layout inspiration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Template pick | User taps "Top + Bottom + Shoes" | Canvas opens empty; template's per-category slot map (position/scale/rotation/z-index) is cached for later placement | N/A |
| Blank canvas | User taps "Blank canvas" | Canvas opens empty; no slot map cached | N/A |
| First item of a slotted category | Tap an item chip whose category has a template slot | Item placed at that slot's x/y/scale/rotation/z-index | N/A |
| First item, no template | Tap an item chip on blank canvas, or a category the chosen template doesn't seed | Item placed centered on canvas | N/A |
| Second item, same category | Add another item to a category already occupied | New item placed with a small fixed offset from the previous one (never exact overlap), both independently draggable | N/A |
| Gesture on any item | Drag, pinch, or rotate a placed item | Item's x/y/scale/rotation update live; item is no longer tied to its template slot | N/A |
| Reorder | Tap/drag an item that should come forward | Item's z-index becomes the current maximum so it renders topmost | N/A |
| Empty category in tray | Active category has zero wardrobe items | Tray shows that category's empty state, no crash | N/A |
| Reduce Motion enabled | Any item transform | Applied instantly, no easing/spring | N/A |

</frozen-after-approval>

## Code Map

- `app/(tabs)/fits.tsx` -- currently a "coming soon" placeholder; replace with the empty-state prompt ("Build your first Fit.") + "New Fit" action per EXPERIENCE.md's State Patterns table.
- `app/add-item.tsx` -- template to imitate: single top-level route, internal `mode` state machine, Zustand store for session state, `router.back()` to exit. Mirror this shape for `app/new-fit.tsx`.
- `app/_layout.tsx` -- root layout; needs `GestureHandlerRootView` wrapper added (none exists yet anywhere in the repo) for gesture-handler to work at all.
- `stores/wardrobeCapture.ts` -- Zustand pattern to imitate (`create<State>((set) => ({...}))`, plain actions, no middleware) for the new `stores/fitBuilder.ts`.
- `lib/wardrobe/listItems.ts` -- `useWardrobeItems(userId)` (TanStack Query) and `WardrobeItemRow` type; reuse as-is for the tray.
- `lib/wardrobe/thumbnailUrls.ts` -- `useThumbnailUrls(paths)`; reuse `thumb_path` for tray chips.
- `lib/wardrobe/addItem.ts` -- `WardrobeItemCategory` type, `CATEGORY_OPTIONS`, `CATEGORY_LABELS`; single source of truth, reuse directly.
- `components/wardrobe/CategoryFilterChips.tsx` -- pattern to imitate for the category-tray chips.
- `components/wardrobe/WardrobeGridCell.tsx` (lines 25-31) -- `expo-image` usage pattern (`contentFit="contain"`) to reuse for canvas/tray item images.
- `tailwind.config.js` -- existing tokens (`ink.primary`, `surface.base`, `border.hairline`, `spacing.gutter`) to reuse; no changes needed.
- `mockups/fit-builder-canvas.html` (`_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/mockups/`) -- visual reference for template-picker cards and canvas item styling.
- `__tests__/listItems.test.ts` -- existing test-style template to imitate (mock `@/lib/supabase`, fixture factory, plain `describe`/`it`).
- `package.json` -- confirms `react-native-gesture-handler` and `react-native-reanimated` already installed; no new gesture/animation deps needed for this story.

## Tasks & Acceptance

**Execution:**
- [x] `lib/fitBuilder/templates.ts` -- define `FIT_TEMPLATES` (a `Record` of template id → per-`WardrobeItemCategory` slot `{x, y, scale, rotation, zIndex}`, as percentages) for "Top + Bottom + Shoes" and "Layered Outerwear" -- gives deterministic seed data the store and tests both depend on.
- [x] `__tests__/fitTemplates.test.ts` -- unit tests: each template returns the right slot for its seeded categories, and `undefined` for a category it doesn't seed -- written before the store consumes this data.
- [x] `stores/fitBuilder.ts` -- Zustand store: `selectTemplate`, `addItem` (uses the template slot if one exists for that category, else centers; offsets a second same-category item), `updateItemTransform(id, {x,y,scale,rotation})`, `selectItem`, `bringToFront`, `reset` -- holds all in-progress canvas state, no persistence.
- [x] `__tests__/fitBuilderStore.test.ts` -- unit tests per the I/O matrix: template seeding position, blank-canvas centering, same-category offset, `bringToFront` z-index ordering, `reset` clears state -- written before wiring into UI.
- [x] `components/fitBuilder/TemplatePicker.tsx` -- swipeable carousel of template cards (per user-provided UI inspiration) using existing `Text`/`Button` and card styling conventions.
- [x] `components/fitBuilder/CanvasItem.tsx` -- one gesture-driven item: composed `Pan`/`Pinch`/`Rotation` gestures (`react-native-gesture-handler` + `react-native-reanimated`), `hitSlop` for small cutouts, 2px `ink-primary` selection outline.
- [x] `components/fitBuilder/FitCanvas.tsx` -- full-bleed `surface-base` canvas rendering items from the store; tap selects and calls `bringToFront`. Reads `templateId` from the store (same pattern as its other store reads); for every category in that template's slot map with zero placed items, renders a non-interactive ghost-silhouette placeholder ("+" circle + category label) at the slot's position, matching `TemplatePicker`'s preview styling -- this is the promised visual guidance for unfilled slots (Spec Change Log entry, Review Triage Log #19).
- [x] `components/fitBuilder/CategoryTray.tsx` -- category chips (reuse `CategoryFilterChips` pattern) + scrollable item thumbnails for the active category; tap calls `addItem`.
- [x] `components/fitBuilder/GarmentSilhouette.tsx` -- filled SVG garment shape per category (top/bottom/outerwear/shoes; none for accessory) via `react-native-svg`, in fittr's light palette -- matches the layout of a user-provided reference screenshot without adopting its color theme.
- [x] `components/fitBuilder/GhostSlot.tsx` -- shared silhouette + "+" badge + label composition, used by both `TemplatePicker`'s preview cards and `FitCanvas`'s unfilled-slot placeholders so the two don't duplicate this markup.
- [x] `__tests__/categoryTray.test.tsx` -- component tests: default category selection, empty-category state, category switching, `onAddItem` firing -- covers the matrix's "Empty category in tray" row.
- [x] `app/new-fit.tsx` -- top-level route, `mode: 'template' | 'canvas'` state machine mirroring `add-item.tsx`'s shape; composes `TemplatePicker`, then `FitCanvas` + `CategoryTray`; header has back/cancel + title only (no Save button — save is Story 3.2, shipping a non-functional button would be a half-finished UI element).
- [x] `app/(tabs)/fits.tsx` -- replace "Fits are coming soon." with the empty-state prompt + "New Fit" action navigating to `/new-fit`.
- [x] `app/_layout.tsx` -- wrap the app root in `GestureHandlerRootView`.

**Acceptance Criteria:**
- Given the Fits tab with no saved Fits, when I open it, then I see "Build your first Fit." and a "New Fit" action (My Fits grid itself is Epic 4, not built yet).
- Given the template picker, when I choose "Blank canvas", then the canvas opens with zero items and no template slot data cached.
- Given a template chosen and two items of the same category added, when both are on canvas, then they occupy visibly distinct positions and remain independently draggable/pinchable/rotatable.
- Given the canvas, when the OS Reduce Motion setting is on, then item transforms apply with no spring/easing animation.
- Given the canvas with unsaved changes, when I navigate away, then the arrangement is discarded (no persistence exists yet in this story).

## Implementation Notes

- Implemented directly in this session (task-by-task, tests before code) rather than via a single autonomous subagent dispatch, per the human's explicit request to review each file as it landed.
- `TemplatePicker` was built as a swipeable carousel with ghost-silhouette "+" slot previews per user-supplied UI inspiration mid-planning; the inspo's undo/redo, per-item duplicate/flip, and background-picker were intentionally left out (logged to `deferred-work.md`) since they're not in this story's acceptance criteria, and the color/dark theme was not adopted -- new screens use fittr's existing light `ink`/`surface` tokens.
- Matrix Test Audit: 7 of 9 I/O matrix rows are covered by `fitBuilderStore.test.ts`/`fitTemplates.test.ts`/`categoryTray.test.tsx`. The remaining two are satisfied by construction rather than a dedicated test: "Gesture on any item" (drag/pinch/rotate itself can't be meaningfully unit-tested under this repo's existing Jest setup -- no prior gesture-handler test precedent exists anywhere in the codebase; the store-level transform-update/unlock behavior it depends on is covered) and "Reduce Motion enabled" (`CanvasItem` never applies spring/easing to any transform, so there is no motion for the OS setting to strip -- the boundary holds by never introducing easing, not by a runtime branch to test).
- `react-hooks/immutability` (React Compiler's ESLint rule) flags `.value` writes on Reanimated shared values inside gesture `onUpdate` callbacks that share a value with a `useEffect` above -- a known false positive for this pattern (shared values are intentionally mutable outside React's render tracking). Suppressed with `eslint-disable-next-line` and a comment on each occurrence in `CanvasItem.tsx`.
- Three unrelated pre-existing tests (`signInScreen`, `onboarding`, `wardrobeGrid`) timed out when the full suite ran with default parallelism; all pass when run in isolation (`npx jest <name> --runInBand`). Environment flakiness, not a regression from this story's diff -- not investigated further as out of scope. (A fourth, `itemDetail.test.tsx`, showed the same flakiness during review pass 1's re-run; also confirmed passing in isolation.)
- **Layout fidelity pass:** after seeing the first design pass rendered (garment ghost regions overlapped enough to visually merge into one shape), the user asked for exact positions/sizes matching their reference screenshot. Restructured `FIT_TEMPLATES` from one-slot-per-category to an ordered slot list (`TemplateSlot[]`) since the reference seeds **two** Accessories slots -- impossible to express in the old `Partial<Record<category, slot>>` shape. `addItem` now takes the Nth item of a category from the Nth defined slot verbatim (supporting multiple slots per category) and only spirals once slots run out, anchored on the last defined slot. Renamed `top-bottom-shoes` to `shorts-and-top` with hand-measured positions/sizes/z-order from the reference (Tops layered above Coats & Jackets, matching their overlapping corner). `getTemplateSlot` (singular) became `getTemplateSlots` (array); `GhostSlot` now takes each slot's own explicit `width`/`height` instead of a fixed per-category lookup table.
- **Post-review design pass:** the user shared a second reference screenshot of the canvas screen itself (garment-shaped silhouettes behind each unfilled slot, not just a plain "+" circle). Added `GarmentSilhouette` (filled SVG shapes per category, using `react-native-svg` -- already a dependency) and a shared `GhostSlot` (silhouette + "+" badge + label) used by both `TemplatePicker`'s preview cards and `FitCanvas`'s unfilled-slot placeholders, replacing the plainer circle-only version from review pass 1. Accessory intentionally gets no silhouette (too varied a category for one shape to represent, matching the reference). Kept fittr's existing light palette throughout (`border-hairline` token for the silhouette fill, matching the original approved mockup's own `.silhouette` CSS), not the reference's dark/pastel theme, per the earlier-approved decision.
- **Review pass 1 fixes** (see Review Triage Log for full findings and routing): rewrote `addItem`'s same-category placement from a broken canvas-center-relative offset to a bounded sunflower-seed (phyllotaxis) pattern anchored on the category's actual slot/center, fixing both the "not near the previous item" and "saturates into exact overlaps past ~9 items" bugs; added a `Gesture.Tap()` raced against the drag/pinch/rotate group in `CanvasItem` so a stationary tap actually selects/reorders (Pan alone requires movement to activate); clamped drag position and pinch scale to sane bounds; clamped `TemplatePicker`'s scroll-derived page index (iOS edge rubber-banding could otherwise crash the picker via an out-of-range array access) and extracted `clampPageIndex` as a tested pure function; gave unnamed `CategoryTray` items distinguishable accessibility labels instead of a shared generic one; added `hitSlop` to the "Skip for now" link; added the ghost-silhouette placeholder rendering to `FitCanvas` that the frozen Intent had promised but the original Tasks section never specified (bad_spec finding #19, resolved by amending the Tasks/Code Map above rather than a full revert-and-rederive, since only this one file's requirement was under-specified and everything else was unaffected).

## Spec Change Log

- **Triggering finding:** Review Triage Log #19 -- the frozen Intent/Approach promises "Unfilled template slots render as a ghost-silhouette placeholder with a '+' affordance," but the Tasks & Acceptance entry for `FitCanvas` never actually specified building it, so it shipped without it.
- **Amended:** Added an explicit `FitCanvas` requirement (below) to render a ghost-silhouette "+" placeholder, matching `TemplatePicker`'s existing preview style, for every template category-slot with no placed item yet; `FitCanvas` now takes `templateId` as a prop to know which slots to check.
- **Known-bad state avoided:** Choosing a template and then only ever seeing bare canvas with no indication of which category slots remain -- contradicts the approved UI-inspiration direction and the frozen Approach text itself.
- **KEEP:** Everything else from the first implementation pass -- `stores/fitBuilder.ts`'s overall shape (only its `addItem` offset math changes, per Review Triage Log #1/#2), `TemplatePicker`'s carousel structure, `CategoryTray`, `app/new-fit.tsx`'s mode state machine and unmount-reset, `app/(tabs)/fits.tsx`, `app/_layout.tsx`'s `GestureHandlerRootView` wrap, and all existing passing tests -- none of that is implicated by this finding and must survive re-derivation unchanged.

## Review Triage Log

Review pass 1 (blind-hunter, edge-case-hunter, verification-gap, run in parallel against the full diff):

1. `stores/fitBuilder.ts` `addItem` -- second-in-category item bases position on `CENTERED_SLOT`, not the previously-placed item's actual position (blind-hunter). **medium** -- verified: for `top-bottom-shoes`, a 2nd shoe lands at (0.56,0.56) vs. the 1st at (0.5,0.86), not "near" it as the frozen matrix requires. Routed: patch.
2. Same function -- `SAME_CATEGORY_OFFSET` accumulates unbounded; `clamp01` saturates so the ~9th+ same-category item overlaps exactly (blind-hunter). **medium** -- verified by reading the offset math; violates the matrix's "never exact overlap" for the explicitly-supported unlimited-items-per-category case. Routed: patch (same root cause as #1).
3. `__tests__/fitBuilderStore.test.ts`'s "offsets a second item" test only asserts inequality, not proximity, so it wouldn't catch #1/#2 (blind-hunter). **medium** -- verified true; same root cause as #1/#2, folded into that patch's test update.
4. `components/fitBuilder/CanvasItem.tsx` -- `onSelect`/`bringToFront` fire only from `Gesture.Pan().onStart()`, which requires crossing gesture-handler's movement threshold; a stationary tap likely never registers (blind-hunter). **medium** -- verified against gesture-handler's default activation behavior; the frozen matrix's "Tap/drag ... to come forward" row implies tap alone must work. Routed: patch.
5. Same file -- `hitSlop` calculation is unreachable dead code since the only caller always passes `itemSize=140 > MIN_TOUCH_TARGET` (blind-hunter). **false** -- the 44pt touch-target floor is met unconditionally by the fixed 140px item size regardless of this calculation; no actual defect.
6. `app/new-fit.tsx` -- `useWardrobeItems` has no loading-state handling; tray can show "No items in this category" during the initial fetch (blind-hunter, edge-case-hunter). **low** -- verified real but narrow: same TanStack Query key as the Wardrobe tab, so cache is normally warm by the time a user reaches this screen; only a cold-start edge case. Rejected: fix requires a new loading branch/prop (more than a direct correction) and unlikely to be met in everyday use.
7. `components/fitBuilder/TemplatePicker.tsx`'s "Skip for now" link has no `hitSlop` (blind-hunter, partial). **low** -- verified: no hitSlop present, unlike every other small tappable in these new files. Routed: patch (one-line fix, folded into the bundle).
7b. Same finding's claim about `CategoryTray`'s category chips -- **false**: they already have `hitSlop={8}`, contrary to the finding's uncertainty.
8. `stores/fitBuilder.ts` `addItem` calls `maxZIndex(items)` twice redundantly (blind-hunter). **low** -- verified true, harmless but avoidable. Routed: patch (folded into #1/#2's fix).
9. No PostHog analytics events fired anywhere in the new flow, unlike `add-item.tsx`'s `trackItemAdded` precedent (blind-hunter). **medium if real, unverified as required** -- no AC or planning artifact requires Fit-builder analytics; genuinely a scope question, not a defect. Routed: defer.
10. Story 2.4's "Create Fit With This" action (per `epic-3-context.md`'s Cross-Story Dependencies) has no wiring into `app/new-fit.tsx` -- no route params accepted (blind-hunter). **medium if real** -- verified no params exist; but the human-approved frozen Intent scopes this story to Fits-tab entry only and never mentions item-detail prefill. Routed: defer (out of this story's approved intent).
11. `components/fitBuilder/CategoryTray.tsx`'s empty-category state has no CTA into the add-item flow (blind-hunter). **low** -- real UX rough edge, not required by any AC. Routed: defer.
12. `components/fitBuilder/CanvasItem.tsx` -- no bounds clamp on `translateX`/`translateY`; an item can be dragged off-canvas with no way back short of a full reset (edge-case-hunter). **low** -- plausible footgun, trivial one-line clamp fix. Routed: patch (folded into the bundle).
13. Same file -- no min/max clamp on pinch `scale`; item can shrink to invisible or grow unbounded (edge-case-hunter). **low** -- same reasoning as #12. Routed: patch (folded into the bundle).
14. Duplicate of #2 (10th+ same-category item saturates and overlaps), independently found by edge-case-hunter. Same verdict/route as #2.
15. `components/fitBuilder/TemplatePicker.tsx`'s `handleScroll` computes `pageIndex` unclamped; iOS edge rubber-banding (a routine, everyday gesture) can produce an out-of-range index, making `activeTemplate` `undefined` and throwing on `activeTemplate.label` (edge-case-hunter). **high** -- verified: `TEMPLATE_OPTIONS[-1]`/`[2]` is `undefined` in JS, and the very next line dereferences `.label` unconditionally during render. Routed: patch.
16. `components/fitBuilder/CategoryTray.tsx` -- items with `name === null` (a common, optional field) share the identical accessibility label "Add item," indistinguishable to VoiceOver (edge-case-hunter). **medium** -- verified against `WardrobeItemRow.name: string | null` and Epic 2's optional-name convention. Routed: patch.
17. Duplicate of #6 (loading-vs-empty ambiguity), independently found by edge-case-hunter. Same verdict/route.
18. `components/fitBuilder/FitCanvas.tsx` -- a newly-added item can render invisible-but-interactive (full hit area, no image) while its signed cutout URL is still resolving (edge-case-hunter). **low** -- verified real but narrow timing window, self-corrects on next render. Rejected: fix requires a new loading-placeholder branch (more than direct correction), unlikely to be hit for more than a flash.
19. `components/fitBuilder/FitCanvas.tsx` never renders the ghost-silhouette "+" placeholder for unfilled template slots that the frozen `## Intent`/Approach explicitly promises (edge-case-hunter, high confidence). **medium** -- verified: `FitCanvas` only maps over placed `items`, never reads `templateId`/`FIT_TEMPLATES`. Root cause: the non-frozen Tasks & Acceptance entry for `FitCanvas` never actually specified this, even though frozen Approach promised it. Routed: **bad_spec** (spec's operational Tasks section under-specified what Approach promised).
20. "Blank canvas" isn't a literal carousel card; it's reached via the "Skip for now" link (edge-case-hunter, medium confidence). **false** -- this is the exact, already-approved design from the human-provided UI inspiration, documented in this spec's own Design Notes/Approach.
21. No test exercises `app/new-fit.tsx`'s unmount-triggered `reset()` (the sole mechanism for "discard on navigate away") (verification-gap). **defer** -- real gap, but no route-lifecycle unmount test exists anywhere in this repo for any screen, including `add-item.tsx` (the template this mirrors); establishing that test pattern is bigger than this story.
22. Duplicate of #1 (addItem offset-from-center bug), independently found by verification-gap. Same verdict/route.

Routing outcome: one **bad_spec** entry (#19) triggers amending this spec's Tasks & Code Map before re-implementing `FitCanvas`'s ghost-slot rendering; findings #1/#2/#3/#8/#14/#22 (offset math), #4 (tap-to-select), #7 (skip-link hitSlop), #12/#13 (drag/pinch bounds), #15 (carousel crash), #16 (accessibility label) are bundled into one **patch** pass since they're independent, well-scoped, low-risk fixes with no interaction with the bad_spec area. Findings #6/#17, #9, #10, #11, #18, #21 are **defer** (logged to `deferred-work.md`). #5, #7b, #20 are **false** (rejected).

## Design Notes

Canvas items are bare cutouts (no card background/shadow) per the mockup and DESIGN.md's minimalist brand posture — resist the urge to add a card, border, or shadow to unselected items; the only visual state change is the 2px outline on selection. Template slot data is intentionally static/hand-authored (not derived from item aspect ratios) since the epic only requires seeding *position*, not content-aware layout:

A template slot only sets an item's *starting* x/y/scale/rotation/z-index at the moment it's added — it is not a fixed frame or container. The ghost-silhouette placeholder is just a visual hint of where a category's item will land; once an item occupies it, the placeholder is gone and the item behaves exactly like one added to blank canvas: fully freeform from the very first drag/pinch/rotate, with no memory of "belonging" to that slot.

```ts
export const FIT_TEMPLATES: Record<TemplateId, Partial<Record<WardrobeItemCategory, CanvasSlot>>> = {
  'top-bottom-shoes': {
    top: { x: 0.5, y: 0.28, scale: 1, rotation: 0, zIndex: 2 },
    bottom: { x: 0.5, y: 0.55, scale: 1, rotation: 0, zIndex: 1 },
    shoes: { x: 0.5, y: 0.85, scale: 0.8, rotation: 0, zIndex: 1 },
  },
  ...
};
```

## Verification

**Commands:**
- `npx jest --runInBand` -- expected: full suite passes (179/179 after review pass 1's added tests; ran in-band to avoid unrelated parallel-worker timeout flakiness observed on this machine). Confirmed passing.
- `npx tsc --noEmit` -- expected: no type errors. Confirmed clean.
- `npx expo lint` -- expected: no errors. Confirmed clean (after suppressing 4 known-false-positive `react-hooks/immutability` findings on Reanimated shared-value writes, see Implementation Notes).

**Manual checks (if no CLI):**
- On simulator/device: template picker matches mockup card layout; canvas drag/pinch/rotate feels responsive (gesture feel can't be unit-tested); toggling Reduce Motion removes animation easing; Dynamic Type at the largest accessibility size doesn't truncate tray labels or overlap canvas items.
