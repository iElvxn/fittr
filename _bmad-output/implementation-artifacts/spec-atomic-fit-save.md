---
title: 'Save a Fit in one database transaction'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
baseline_commit: '0e763b5059247b6c72830cefe83a6a70fb8c64dd'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `insertFit` (`lib/fits/saveFit.ts:113`) writes `fits`, then `fit_items`, then deletes removed placements, as separate requests. If `fit_items` fails during an edit, the row keeps the new name and cover, the new cover files are deleted so the row points at missing files, and the existing Fit is soft-deleted. A retry repairs it; Cancel loses the Fit.

**Approach:** One Postgres function saves the Fit row and its placements in a single transaction, and `insertFit` calls it. A failed save changes nothing in the database, so the row rollback goes away. Cover files are never deleted after a failed save, because the outcome of a lost request can't be known.

## Boundaries & Constraints

**Always:**
- Test first: write each failing test, run it, confirm it fails for the expected reason, then write the code.
- The function runs as the caller (`security invoker`), so the existing RLS policies still decide access. `anon` can't execute it.
- The owner comes from `auth.uid()`, never from an argument.
- A save replaces the Fit's placements in the same transaction. `p_items` must be a JSON array; anything else is rejected before any write.
- A save never brings back a soft-deleted Fit, and never moves a placement from another Fit; both are rejected.
- No failed save deletes new cover files: not a failed upload, not a failed save. An orphaned file is harmless; a Fit pointing at a missing file is the bug being fixed.
- The previous cover is deleted best-effort, only after a successful save, using paths recorded when the sheet opened.
- A new Fit keeps one id for as long as the screen is open, so saving again after a lost response can't create a duplicate.
- The sheet says "No connection" only for connection failures; any other failure shows `UNKNOWN_ERROR_MESSAGE`.
- `0017` is applied to every Supabase project the app uses, and `save_fit` confirmed to respond, before merging or shipping any update.

**Never:** no change to RLS policies, `getFitItems`, or cover upload order. No restoring Fits this bug already deleted (they can't be told apart from real deletes). No Item rollback changes (`saveBatch` is separate).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New Fit | valid name, cover, placements | Fit and placements saved together | N/A |
| Edit | placements added and removed | row updated, placements match the payload exactly | N/A |
| Empty payload | `p_items` is `[]` (database only; the app blocks saving an empty canvas) | row updated, all placements removed | N/A |
| Invalid payload | `p_items` null or not an array | rejected, nothing changes | generic failure |
| Placement fails | nonexistent `item_id` on an edit | nothing changes: old name, cover and placements remain, Fit not deleted | generic failure in the sheet; cover files kept |
| Connection lost | request fails, outcome unknown | cover files kept; same-sheet retry succeeds, one Fit | no-connection notice |
| Gateway error | 502 or 504, outcome unknown | cover files kept | generic failure |
| Close and save again | new Fit, response lost, sheet closed, Save tapped | same Fit id: one Fit, same placements | N/A |
| Retry rejected | attempt 1 committed, attempt 2 rejected | committed row's cover files remain | generic failure |
| Same save twice | identical arguments | one Fit, same placements, no error | N/A |
| Placement of another Fit | payload id already on a different Fit | rejected, both Fits unchanged | generic failure |
| Another user's Fit | caller doesn't own `fit_id` | rejected, nothing changes | generic failure |
| Deleted Fit | row is soft-deleted | rejected, stays deleted | generic failure |
| Signed out | anon caller | rejected | generic failure |

</frozen-after-approval>

## Code Map

- New `supabase/migrations/0017_save_fit.sql` -- `create or replace function public.save_fit(p_fit_id uuid, p_name text, p_cover_path text, p_cover_thumb_path text, p_canvas_background_color text, p_items jsonb) returns void`.
  - `language plpgsql security invoker set search_path = ''`, schema-qualified names. Not `strict`: the background color may be null. Volatile (the default).
  - First statement: `if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid items' using errcode = '22023'; end if;`. SQL NULL otherwise reads as zero rows and wipes the placements.
  - `insert into public.fits (id, user_id, name, cover_path, cover_thumb_path, canvas_background_color) values (..., auth.uid(), ...) on conflict (id) do update set name, cover_path, cover_thumb_path, canvas_background_color where public.fits.deleted_at is null`. Must be the first write: it takes the row lock.
  - `if not found then raise exception 'fit not saved' using errcode = 'P0002'; end if;`. Neutral: this also covers another user's soft-deleted Fit.
  - Delete this Fit's `fit_items` whose id isn't in `p_items`, then insert from `jsonb_to_recordset(p_items)` (`id uuid, item_id uuid, x real, y real, scale real, rotation real, z_index integer`) `on conflict (id) do update set item_id, x, y, scale, rotation, z_index where public.fit_items.fit_id = excluded.fit_id`. No `fit_id` in the `set` list.
  - `get diagnostics` the row count; if it differs from `jsonb_array_length(p_items)`, raise the same `P0002`.
  - `revoke execute on function public.save_fit(uuid, text, text, text, text, jsonb) from public, anon; grant execute ... to authenticated;`. Supabase's default privileges grant `anon` directly.
  - `comment on function`, header comment in the repo's style, and end with `notify pgrst, 'reload schema';`.
- `lib/fits/saveFit.ts`:
  - `insertFit` -- remove `userId`. Call `supabase.rpc('save_fit', ...)`, sending explicit nulls and snake_case `z_index`. On error: `isNoConnectionError` → `FitError('no_connection', ...)`, otherwise rethrow.
  - Stale-cover cleanup stays, after success only.
  - Remove `deleteOrphanedFitItems`, `rollbackOrphanedFit` and `rollbackCover`, including `uploadCover`'s call. Keep `Promise.allSettled`, so a retry never races an upload still in flight. Update the doc comments (`:26-41`, `:102-112`).
- `app/new-fit.tsx`:
  - New Fit id: `const [newFitId] = useState(() => Crypto.randomUUID())`, used at `:257`.
  - `PendingSave` gains `previousCoverPath` and `previousThumbPath`, set from `editingFit` at `:256`; `:296` passes those, not live `editingFit` values. A refetch before a retry would otherwise make the old pair look current.
  - Replace `connectionError` with `saveError: string | null`. In the `catch`: `FitError` with `no_connection` → `NO_CONNECTION_MESSAGE`, otherwise `UNKNOWN_ERROR_MESSAGE`.
  - Comments: `:130` (`insertFit` no longer resurrects), `handleSavePress` doc ("`saveFit`'s upsert calls"), and the `catch` (a failed save writes nothing unless the connection dropped after commit; keep the `refetchType: 'none'` invalidations for that).
- `components/fitBuilder/SaveFitSheet.tsx:17,43,89` -- `errorMessage: string | null` replaces `connectionError`. `ConnectionErrorNotice` shows it.
- `__tests__/saveFit.test.ts` -- `describe('insertFit')` (`:160`) mocks `from` chains; rewrite around a mocked `supabase.rpc`. Update `uploadCover`'s rollback cases (`:87-132`) to assert nothing is removed.
- `__tests__/newFit.test.tsx:263,427` -- drop the leading `'user-1'`; add cases below. `__tests__/saveFitSheet.test.tsx:10,63` -- the new prop.
- `supabase/tests/rls.test.ts:483` -- extend the `fits/fit_items RLS` block, reusing its fixtures and cleanup. Update the comment at `:481`.
- `deferred-work.md` -- add a `resolved_by` line to the entries at `:225`, `:233` and `:260`; narrow `:82` to cover cleanup. Leave `:257` open.

## Tasks & Acceptance

**Execution** (each test task runs red before its code task):
- [x] `supabase/tests/rls.test.ts` -- real-database cases, red with `PGRST202` until applied: new Fit; edit replaces placements; `[]` empties; null `p_items` rejected with `22023`, Fit unchanged; nonexistent `item_id` rejected with `23503`, name, cover and placements unchanged, `deleted_at` null; same args twice give one Fit; placement of another own Fit rejected with `P0002`, both unchanged; second user with paths in their own folder rejected with `42501`, unchanged; second user sending the first user's placement id rejected, row unchanged; soft-deleted Fit rejected with `P0002`, placements unchanged; anon rejected with `42501`.
- [x] `supabase/migrations/0017_save_fit.sql` -- add the function. The user applies it to the dev project, then the cases above go green.
- [x] `__tests__/saveFit.test.ts`, `__tests__/saveFitSheet.test.tsx`, `__tests__/newFit.test.tsx` -- failing tests: RPC payload and mapping; no-connection maps to `FitError`; a coded rejection and a code-less gateway error both rethrow; no failure path removes cover files; stale-cover cleanup after success only; sheet shows its message; generic message on a non-connection failure; close and save again reuses the Fit id; retry passes the paths recorded at open.
- [x] `lib/fits/saveFit.ts`, `components/fitBuilder/SaveFitSheet.tsx`, `app/new-fit.tsx` -- call the function, remove the rollback, wire the message, the stable id and the recorded paths.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the closed entries.

**Acceptance Criteria:**
- Given `grep -rn "rollbackOrphanedFit\|deleteOrphanedFitItems\|rollbackCover" lib app`, when run, then there are no matches.
- Given the migration applied and old builds still in use, when they save, then they keep working: tables and policies are unchanged.
- Given the new client and a project without `0017`, when release steps are followed, then this can't ship: the rollout notes require confirming `save_fit` responds first.

## Spec Change Log

- 2026-11-06, after review (adversarial, edge-case, Supabase best practices, security), before approval: cover files are never deleted after a failed save, not only on no-connection; `p_items` validated; placements can't move between Fits; generic failure message added to the sheet (this relaxes the original "no UI change" rule); stable new Fit id; previous cover paths recorded at open; neutral error code; test-first task order; explicit rollout rule.

## Review Triage Log

| # | Layer | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | blind | `insertFit`'s payload never ran against the real function | medium | patch | Integration test added through the real `insertFit`; it passes |
| 2 | gap, blind | Placement values never read back after an edit | medium | patch | New case moves a kept item and reads the row |
| 3 | gap, blind | Background color, thumbnail and preserved columns not asserted | medium | patch | Asserted on a real edit, including `is_favorite` and `created_at` |
| 4 | gap | Signed-out test passes without the `anon` revoke | medium | patch | Now asserts the function-permission message |
| 5 | blind | Late `P0002` rollback untested on an existing Fit | medium | patch | New case proves the Fit and the other Fit are unchanged |
| 6 | blind, edge | Another user's soft-deleted Fit untested | low | patch | New case returns `P0002`, Fit unchanged |
| 7 | gap | Gateway row accepted any rejection | low | patch | New case asserts the same error object is rethrown |
| 8 | blind | Raw network errors show the generic message | low | patch | Failing test first, then `isOffline` |
| 9 | blind, edge | Migration comment overstated neutrality; retry comments overstated | low | patch | Reworded. Comment only: `0017` doesn't need re-applying |
| 10 | blind, edge | A Fit deleted elsewhere retries forever with the generic message | low | defer | Needs a race with another device; fixing it adds new `P0002` handling |
| 11 | gap | Nothing confirms `save_fit` on production | medium | defer | No release tooling exists; the rollout rule covers this release |
| 12 | blind, edge | Close-and-save-again orphans a committed cover pair | low | reject | Harmless, and covered by the deferred cover sweep |
| 13 | blind, edge | Default name drifts after a lost commit | low | reject | Needs a lost response then closing the sheet; the fix adds state |
| 14 | edge | A late commit could overwrite a newer save | low | reject | Needs a delayed request to outlast a whole retry; the fix adds versioning |
| 15 | edge | Another user's `item_id` is accepted | low | reject | Already deferred; pre-existing, no data exposed |
| 16 | gap | Gateway page containing "network" reads as no connection | maybe-false | reject | No real page checked; at worst the wrong message |

## Design Notes

- `security invoker` over `definer`: nothing here needs to bypass RLS. Another user's live Fit fails the update policy with `42501`.
- The test for that must use the second user's own cover paths: their check constraints run first and would otherwise fail with `23514`, proving nothing about RLS. A bad `item_id` must be nonexistent: foreign keys ignore RLS, so another user's real item id succeeds (deferred).
- `fits_set_updated_at` (0010) fires on the same columns as today, so a re-save resurfaces the Fit as before.
- Cover files can't join the transaction, and a gateway error or lost response doesn't say whether Postgres committed. So failures keep the files. The cost is orphaned files, tracked in `deferred-work.md`.
- If the signature changes after `0017` is on a shared project, `drop function` first: a changed type creates an overload, which fails with `PGRST203`.
- Rollout: apply `0017` to each project and confirm `rpc('save_fit')` resolves, then merge. CI's `rls.test.ts` runs against the dev project and fails until then. OTA updates reach users quickly, so the order matters. To roll back, ship the previous JS; the function can stay in place unused.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2`, `npm run typecheck`, `npm run lint` -- expected: pass, clean.
- `node --env-file=.env.local node_modules/jest/bin/jest.js --selectProjects supabase-integration` -- expected: all pass, after the migration is applied.

**Manual checks:** on a device, edit a Fit and save; add and remove items and confirm the placements. Turn on airplane mode during Save, then retry online: one Fit, correct cover.

## Implementation Notes
