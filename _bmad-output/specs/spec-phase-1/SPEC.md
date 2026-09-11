---
id: SPEC-phase-1
companions: [stack.md, data-model.md, image-pipeline.md, screens-and-flows.md, analytics-and-metrics.md, milestones.md, product-context.md, ../../planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md, ../../planning-artifacts/ux-designs/ux-fittr-2026-09-09/EXPERIENCE.md]
sources: [docs/phase-1-spec.md, "Fittr MVP Requirements.md"]
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Fittr Phase 1 — Wardrobe and Outfit Loop

## Why

Fittr's MVP hypothesis is that people will repeatedly use a digital version of their wardrobe to create, save, plan, and share outfits — a vision to realize and then validate before investing in the social layer described in the full MVP requirements. Phase 1 is a deliberately narrowed slice of that MVP: accounts, wardrobe, Fits, and planning, with cloud-backed sync so the app survives reinstall, but with the in-app social layer (feed, likes, follows, discover) held back entirely. It exists to answer one question before anything else is built: will someone who catalogs their real wardrobe keep coming back to build, wear, and plan outfits from it — not to test whether they'll also socialize around them. See `product-context.md` for the problems this addresses and the users it targets.

## Capabilities

- **CAP-1 Accounts**
  - **intent:** User can create and manage an account — sign in with Apple or email/password, sign out, delete account — with a required display name and optional avatar.
  - **success:** Sign up, sign in, sign out, and delete account all complete successfully on a dev build.

- **CAP-2 Wardrobe**
  - **intent:** User can add clothing items from camera or library with on-device background removal, category, auto-detected editable color, and optional name/brand/notes, then view them in a filterable grid and edit or delete any item.
  - **success:** Ten items can be added from photos in under three minutes by either capture method, and background removal is acceptable on typical clothing photos laid flat or on a hanger.

- **CAP-3 Batch add**
  - **intent:** User can select multiple photos from the library in one go, or capture several in rapid succession without leaving the camera, and review every item in one shared queue before it saves.
  - **success:** A library multi-select batch and a rapid-camera batch both land in the same queue and review screen, with each item confirmed individually before saving.

- **CAP-4 Fits**
  - **intent:** User can start a Fit from a template that seeds initial item placement, add wardrobe items from any category onto a freeform canvas, freely drag/pinch/rotate/reorder them, then name, save, edit, delete, or favorite the Fit.
  - **success:** A Fit built from wardrobe items across categories can be freely rearranged, saved, edited, and exported as a share image.

- **CAP-5 My Fits**
  - **intent:** User can browse saved Fits in a grid filterable to All, Favorites, or Worn.
  - **success:** The My Fits list correctly narrows to just favorited or just worn Fits when filtered.

- **CAP-6 Planner**
  - **intent:** User can assign a saved Fit to a day on a weekly calendar, view, replace, or remove that assignment, and see today's planned Fit on Home.
  - **success:** A week can be fully planned and a Fit marked worn directly from Home.

- **CAP-7 Share**
  - **intent:** User can export a Fit's rendered collage image to the iOS share sheet.
  - **success:** Share produces a correct collage image that the iOS share sheet can send onward.

- **CAP-8 Cloud persistence**
  - **intent:** The app reads and writes directly to Supabase Postgres and Storage over the network; there is no local database or background sync engine in Phase 1.
  - **success:** Wardrobe, Fit, and planner data created or edited on one device are immediately visible after a reinstall or on another signed-in device, since all data lives in Supabase.

- **CAP-9 Privacy**
  - **intent:** All wardrobe, Fit, and account data stays private to its owner, and deleting an item, Fit, or the account removes the corresponding rows and stored images.
  - **success:** Row-level security rejects cross-user access, and account deletion hard-deletes all of a user's rows and storage objects, then the auth user.

- **CAP-10 Measurement**
  - **intent:** The app emits funnel analytics events and crash reports from first launch, so product usage and stability are measurable throughout Phase 1.
  - **success:** A test event reaches PostHog on a dev build, and the full signup-through-return funnel can be reconstructed from recorded events.

- **CAP-11 Wear streak**
  - **intent:** User can see their current consecutive-day streak of marking a Fit worn, computed passively from existing wear data — no new logging mechanism, no reminders.
  - **success:** The displayed streak count increments when today has a wear entry continuing yesterday's chain, and resets to zero after a day with no wear entry.

## Constraints

- Minimum iOS 17.0, required by the on-device background-removal (subject-lifting) module — rules out supporting older iOS versions.
- Solo developer on Windows: all native builds run on EAS; development uses an EAS development build on a physical iPhone since Expo Go can't host the background-removal module.
- The app requires network connectivity for all reads and writes in Phase 1; there is no offline mode or local-first storage (deferred, see Non-goals).
- No-connection save behavior (CAP-2, CAP-4, CAP-8): block-and-keep — on failure, show "No connection — nothing was lost. Try again," keep the user on the unsaved screen with their input intact, and offer retry; no silent background queue, since there is no local-first layer to queue against safely in Phase 1. Decided during the `bmad-ux` run; see `EXPERIENCE.md`'s State Patterns.
- Background removal runs on-device rather than via an API, for cost, privacy, and speed.
- Category selection is manual in Phase 1 — no AI-based category detection; deferred until it can sit behind a server function.
- No Redis, queues, or streaming in Phase 1.
- Supabase Storage sits behind an `ImageStore` interface so the storage backend can be swapped later (e.g. S3, R2).
- The original photo is discarded once its cutout is confirmed and is never uploaded or retained; a poor cutout is fixed by re-photographing, not reprocessing.
- No data-export feature in Phase 1 — sync-restore-after-reinstall and account deletion already cover the restore and privacy needs export would have served.
- No custom backend or serverless functions beyond Supabase, except where a secret or trust boundary requires one.
- Projected Supabase free-tier storage usage must stay within limits for the launch cohort (M6) — a launch gate, not an aspiration.

## Non-goals

- In-app social entirely: no posts, feed, likes, comments, follows, saves, discover, or notifications. Share means exporting an image to the iOS share sheet only.
- Usernames are collected at onboarding but not surfaced in Phase 1 UI beyond profile settings; no username-based search.
- AI-based clothing category detection.
- Outfit recommendations or an AI stylist.
- Weather-aware outfit recommendations.
- Commerce, affiliate shopping, or marketplace features.
- Android and web platforms.
- Offline usage and local-first storage — deferred to a later phase.

## Success signal

Phase 1 validates the hypothesis that people will repeatedly use a digital version of their wardrobe to create, save, plan, and share outfits when five test users can explain what Fittr is, why to add clothes, how to make a Fit, and why to come back, and a TestFlight cohort's two-week funnel (signup → 5 items → first Fit → second Fit → worn or planned → returned the following week, see `analytics-and-metrics.md`) shows repeated use past initial wardrobe setup.

## Open Questions

- Which additional Fit templates beyond "Top + Bottom + Shoes", "Layered Outerwear", and "Blank canvas" should ship (CAP-4) — finalize once the canvas is built and a few Fits have been made by hand.
