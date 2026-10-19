---
title: 'Story 6.12: WebP Item Cutouts'
type: 'feature'
created: '2026-10-18'
status: 'draft'
route: ''
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

- `lib/wardrobe/processImage.ts:30-56` -- after `extractDominantColor`, encode the cutout to WebP (manipulate → `renderAsync` → `saveAsync`, as in `resizeLongEdge` at :58 but without the resize) and return that URI as `cutoutUri`. Make the thumbnail from the WebP or the PNG; either works since both carry alpha.
- `lib/wardrobe/addItem.ts:57,62,109` -- path to `cutout.webp` and content type to `image/webp` in `uploadItem` and `itemStoragePaths`.
- `supabase/migrations/00NN_wardrobe_items_webp_cutout.sql` (new) -- drop and re-add the `cutout_path` check, in the style of `0007_fits_drop_stale_cover_path_check.sql`. Use the next free number: `0015` is planned for Story 6.2.
- `lib/storageCache.ts:3` -- the comment lists item cutouts with their `.png` name; update it.
- Unchanged but worth a look in review: `app/item/[id].tsx`, `app/new-fit.tsx`, `components/fitBuilder/FitCanvas.tsx`, `components/wardrobe/BatchQueueRow.tsx`. All read `cutout_path` or a local URI, never the extension.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/processImage.test.ts`, `__tests__/addItem.test.ts`, `supabase/tests/rls.test.ts` -- WebP encode step and its failure path, new path and content type, constraint accepts `.webp` and still accepts existing `.png` rows, rejects any other path.
- [ ] `supabase/migrations/00NN_wardrobe_items_webp_cutout.sql` -- the constraint.
- [ ] `lib/wardrobe/processImage.ts`, `lib/wardrobe/addItem.ts`, `lib/storageCache.ts` -- encode, upload, comment.

**Acceptance Criteria:**
- Given a newly added item, when it is saved, then Storage holds `cutout.webp` (no `cutout.png`) and the row's `cutout_path` points at it.
- Given an item added before this story, when Item detail or the builder opens it, then its PNG cutout renders as before.
- Given `supabase db reset`, when run, then the migration applies cleanly and existing rows validate.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device, add the same garment before and after the change and compare the two cutout sizes in Storage. Record the ratio in the Dev Agent Record; it feeds Story 6.11's storage check.
- Check the cutout edges on Item detail and the canvas in light and dark mode: no halo or fringing beyond what the PNG showed.
