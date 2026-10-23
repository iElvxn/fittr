---
title: 'Story 6.12: WebP Item Cutouts'
type: 'feature'
created: '2026-10-18'
status: 'done'
route: 'dispatch'
baseline_commit: '0c618ea7f9c27f42f2541f14402dd91b5969e4ef'
review_loop_iteration: 0
context: []
depends_on: ['6-1-cache-storage-images-by-path']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Each item's cutout is stored as a lossless PNG of up to 1500px on the long edge (`lib/wardrobe/addItem.ts:57`, from `removeBackground` in `lib/wardrobe/processImage.ts:33`). It is probably most of every user's storage, and it is downloaded in full by Item detail and the Fit builder canvas. With a free closet tier on the table, storage and egress per item are the main costs that grow with users.

**Approach:** Re-encode the cutout to WebP with transparency on-device, right after background removal, and upload `cutout.webp` instead of `cutout.png`. Dimensions stay the same. Existing PNG cutouts stay as they are, since every read uses the stored `cutout_path`.

## Boundaries & Constraints

**Always:**
- Encode once, on-device, with `expo-image-manipulator` (`SaveFormat.WEBP`, `compress: 0.9`, the same setting as `resizeLongEdge`). No resize: the cutout keeps its trimmed size, up to 1500px.
- Dominant-color extraction keeps reading the lossless `removeBackground` output, before the WebP encode, so detected colors don't shift.
- New path `{userId}/items/{itemId}/cutout.webp`, uploaded with content type `image/webp`. It stays write-once with `WRITE_ONCE_CACHE_CONTROL` (Story 6.1).
- The migration replaces the `cutout_path` check from `0003` so it accepts either `/cutout.png` or `/cutout.webp` for the row's own `user_id`/`id`. Existing rows must validate. RLS is unchanged.
- No backfill. Old items keep their PNG until the user re-adds them.

**Never:** no change to background removal, the thumbnail (already WebP), the canvas or the Item detail layout. No server-side image processing (NFR2). No lower resolution.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Single add | new item captured | `cutout.webp` + `thumb.webp` uploaded; row's `cutout_path` ends in `.webp` | N/A |
| Batch add | several items queued | each item uploads `cutout.webp`; batch rollback removes the `.webp` paths | failure behavior unchanged |
| WebP encode fails | manipulator throws | same outcome as a failed capture today (`processing_failed`, retake) | no upload attempted |
| Old item | `cutout_path` ends in `.png` | renders in Item detail and the canvas as before | N/A |
| Fit with mixed items | some PNG, some WebP cutouts | canvas renders all; cover capture unchanged | N/A |

</frozen-after-approval>

## Code Map

- `lib/wardrobe/processImage.ts:30-55` -- `processWardrobePhoto`. Leave `removeBackground`, `readRgbaPixels` and `extractDominantColor` as they are (they read the lossless PNG). Add the WebP encode after them: `ImageManipulator.manipulate(pngUri).renderAsync()` then `.saveAsync({ format: SaveFormat.WEBP, compress: 0.9 })`, the probe path of `resizeLongEdge` (:58-63) with no resize. Return that URI as `cutoutUri`. Keep making the thumbnail from the PNG, so it is not lossy-encoded twice. Fix the `cutoutUri` doc comment at :17 ("PNG" → "WebP"). Pull `compress: 0.9` into a shared constant only if it stays readable.
- `lib/wardrobe/addItem.ts:57,62,109` -- `uploadItem` path → `cutout.webp`, content type → `'image/webp'`. `itemStoragePaths` → `cutout.webp`, so the batch rollback removes the right object.
- `supabase/migrations/0016_wardrobe_items_webp_cutout.sql` (new; `0015` is taken by 6.2). The `0003` checks are inline and reference three columns, so Postgres auto-named them `wardrobe_items_check` / `wardrobe_items_check1`, not `..._cutout_path_check` (the lesson from 0007). Do not guess the name: drop the constraint with a `do $$` block that looks it up in `pg_constraint` (`conrelid = 'public.wardrobe_items'::regclass`, `contype = 'c'`, and `pg_get_constraintdef(oid)` mentions `cutout_path`), then `add constraint wardrobe_items_cutout_path_check check (cutout_path = user_id::text || '/items/' || id::text || '/cutout.png' or cutout_path = ... || '/cutout.webp')`. Update the column comment. Write the header comment in the style of 0015.
- `lib/storageCache.ts:1-10` -- the doc comment names covers as `cover-{ts}.png` and items as "cutouts/thumbs". Check its wording still holds and mention `cutout.webp` if it names extensions.
- `docs/phase-1-spec.md:81,142` -- historical spec that says "PNG with transparency" and `cutout.png`. Leave it alone; it records Phase 1.
- Existing PNG fixtures in other tests (`itemDetail`, `fitCanvas`, `catalogSheet`, `wardrobeGrid`, `listItems`, …) stay as they are. They stand in for old items, and the readers never check the extension.
- No change: `app/item/[id].tsx`, `app/new-fit.tsx`, `components/fitBuilder/FitCanvas.tsx`, `app/add-item.tsx`. `add-item.tsx:73-90` already sends any thrown error to `setItemProcessingFailed` (retake), and non-`WardrobeItemError`s also go to Sentry.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/processImage.test.ts` -- add `processWardrobePhoto` tests with mocked manipulator, bg-removal, Skia and File. Check: the WebP encode receives the bg-removal PNG URI; color extraction reads the PNG and not the WebP; `cutoutUri` is the WebP output; the thumb is made from the PNG; when the encode throws, `processWardrobePhoto` rejects. Keep the `extractDominantColor` tests.
- [x] `__tests__/addItem.test.ts` -- update expected paths and content type to `cutout.webp` / `image/webp`, including the batch-rollback paths at :111.
- [x] `supabase/migrations/0016_wardrobe_items_webp_cutout.sql` -- the constraint swap described above.
- [x] `supabase/tests/rls.test.ts` -- add a test: a `.webp` cutout insert succeeds, a `.png` one still succeeds, and `cutout.jpg` or another item's id is rejected. Use the existing create-user/try/finally scaffolding.
- [x] `lib/wardrobe/processImage.ts`, `lib/wardrobe/addItem.ts`, `lib/storageCache.ts` -- the encode, the upload path, the comments.

**Acceptance Criteria:**
- Given a newly added item, when it is saved, then Storage holds `cutout.webp` (no `cutout.png`) and the row's `cutout_path` points at it.
- Given an item added before this story, when Item detail or the builder opens it, then its PNG cutout renders as before.
- Given `supabase db reset`, when run, then the migration applies cleanly, exactly one cutout check remains on `wardrobe_items`, and existing rows validate.

## Implementation Notes

- `processImage.ts`: the bg-removal output is renamed `pngUri`. Color and the thumbnail read it, and the cutout WebP is encoded from it (manipulate → render → save, no resize) at `CUTOUT_WEBP_QUALITY = 0.9`. `resizeLongEdge` keeps its own inline `0.9`.
- `0016` drops every check on `wardrobe_items` whose definition mentions `cutout_path` (only 0003's matches), then adds `wardrobe_items_cutout_path_check` and a column comment.
- Added the `__tests__/fitCanvas.test.tsx` case "mixing pre-6.12 PNG and new WebP cutouts" to cover the matrix's mixed-Fit row.
- Verified after review (2026-10-23): the human applied `0016` to the dev project, and new items save, so the widened check accepts `cutout.webp`. Device: new WebP cutouts are consistently ~200 KB. The PNG size of the same garment was not measured, so Story 6.11 still needs the ratio, against a typical older `cutout.png`. Cutout edges look as clean as the PNGs, per the human. `supabase db reset` and the new RLS case have not been run here.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | processImage tests can't tell cutout from thumb (all three layers) | medium | 100x100 stub never resizes; both saves yield `${PNG_URI}->webp`, so swapping or resizing the cutout passes | patch |
| 2 | Encode-throws test doesn't pin which encode failed (blind, edge) | low | throws on any PNG_URI webp save, thumbnail included | patch |
| 3 | `ENCODE_QUALITY` couples working JPEG, cutout and thumb (blind) | low | lowering it for storage would also change the bg-removal input; direct split | patch |
| 4 | RLS test accepts any error; `foreignFolder` reuses `rejectedItemId` (blind) | low | duplicate-key or RLS error would pass for the wrong reason; direct correction | patch |
| 5 | 0016 doesn't fail if the lookup drops nothing (blind) | low | `pg_get_constraintdef` of 0003's check always contains `cutout_path`; no environment shown where it misses; fix adds a guard | reject |
| 6 | Lossy-alpha halos / no PNG fallback (blind) | false | intent fixes `compress: 0.9`; edge and size checks are the spec's manual checks | reject |
| 7 | PNG decoded twice more (blind) | low | real but a few ms per capture; fix adds a parameter to `resizeLongEdge` | reject |
| 8 | Intermediate PNG/JPEG never deleted (blind, edge) | low | pre-existing (bg-removal PNG and working JPEG were never deleted before); OS-managed cache; fix adds a cleanup branch | reject |
| 9 | Older RLS fixtures still insert `cutout.png` (blind) | false | they stand in for pre-6.12 rows, which the spec keeps valid | reject |
| 10 | No rollback/deploy-order note in 0016 (blind) | low | no migration in the repo carries one; cosmetic | reject |
| 11 | `docs/phase-1-spec.md` still says PNG (verification-gap) | false | the doc records Phase 1 as built; the spec keeps it historical | reject |
| 12 | New RLS case fails in CI until 0016 is applied to the hosted project (verification-gap) | false | CI does run it with secrets, but the 0016 push is the normal pre-merge step, same as 0015 in 6.2; not a defect in the diff | reject |
| 13 | Encode failure shows generic copy, not `processing_failed` (edge) | false | deliberate per Design Notes; item still lands in the retake state | reject |

## Design Notes

- **Encode failure is not wrapped.** The thumbnail step already lets manipulator errors through. `add-item.tsx` marks the item failed (retake) and reports the error to Sentry, which is what we want for an unexpected native failure. Wrapping it in `WardrobeItemError('processing_failed', NO_SUBJECT_FOUND_MESSAGE)` would tell the user "no subject found", which is false, and would hide the error from Sentry. The row shows the generic error message instead.
- **Why the constraint is dropped by lookup.** See 0007: an inline check that references several columns is named `{table}_check[N]`. Looking it up by its definition stays correct whichever suffix it got.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device, add the same garment before and after the change and compare the two cutout sizes in Storage. Record the ratio in the Dev Agent Record; it feeds Story 6.11's storage check.
- Check the cutout edges on Item detail and the canvas in light and dark mode: no halo or fringing beyond what the PNG showed.
