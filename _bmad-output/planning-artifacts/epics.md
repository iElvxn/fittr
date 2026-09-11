---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments: ["Fittr MVP Requirements.md", "_bmad-output/specs/spec-phase-1/SPEC.md", "_bmad-output/specs/spec-phase-1/stack.md", "_bmad-output/specs/spec-phase-1/data-model.md", "_bmad-output/specs/spec-phase-1/image-pipeline.md", "_bmad-output/specs/spec-phase-1/screens-and-flows.md", "_bmad-output/specs/spec-phase-1/milestones.md"]
---

# fittr - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for fittr, decomposing the requirements from the PRD (Fittr MVP Requirements.md, filtered to the Phase 1 subset), and Architecture (SPEC.md and its companions, in place of a standalone Architecture.md) into implementable stories.

**UX design contract (added after this breakdown was written):** `_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md` and `EXPERIENCE.md` now exist and are the authority for visual and behavioral detail not repeated in the acceptance criteria below — component states, error/empty copy (e.g. the exact "No connection — nothing was lost. Try again." save-failure text), and the pure-monochrome/weight-based state signaling. Every story that touches UI should be built against those two files, not just the acceptance criteria here. Both are also now referenced in `SPEC.md`'s `companions:`.

## Requirements Inventory

### Functional Requirements

FR1: Users can create an account via Sign in with Apple or email/password.
FR2: Users can sign in and sign out of their account.
FR3: Users can maintain a basic profile: username (assigned at onboarding, not user-facing search), display name, optional avatar image.
FR4: Users can delete their account, which removes all their data.
FR5: Users can add a clothing item by capturing or uploading a photo.
FR6: The system removes the background from an item photo on-device, producing a transparent cutout.
FR7: Users manually select a category for each item (top, bottom, shoes, outerwear, accessory); there is no AI-based category detection in Phase 1.
FR8: The system auto-detects a dominant color for each item from the cutout, which the user can edit.
FR9: Users can optionally add a name, brand, and notes to an item.
FR10: Users can view their wardrobe as a grid of item thumbnails, filterable by category.
FR11: Users can open an item's detail view showing its image, category, color, name/brand/notes, and the Fits that contain it, with a "Create Fit With This" action.
FR12: Users can edit an item's category, color, name, brand, or notes.
FR13: Users can delete a wardrobe item.
FR14: Users can select multiple photos from their library in one action and review them as a batch queue before saving.
FR15: Users can capture multiple item photos in rapid succession without leaving the camera view, then review them in the same batch queue as library multi-select.
FR16: Users can start a new Fit by choosing a template that seeds initial item placement, or a blank canvas.
FR17: Users can add wardrobe items from any category onto the Fit's canvas and freely drag, pinch-resize, rotate, and reorder them.
FR18: Users can preview the Fit as a rendered collage.
FR19: Users can name and save a Fit; every saved Fit references its underlying wardrobe items and their canvas placement.
FR20: Users can edit a saved Fit, reopening the canvas with items at their saved positions.
FR21: Users can delete a Fit.
FR22: If a wardrobe item used in a Fit is deleted, the Fit keeps its other items and shows a visible gap at that canvas position rather than being deleted itself.
FR23: Users can view all saved Fits in a grid, filterable to All, Favorites, or Worn.
FR24: Users can mark a Fit as a favorite.
FR25: Users can mark a Fit as worn, which records a wear entry; "worn" status is derived from having at least one wear record.
FR26: Users can assign a saved Fit to a specific day on a weekly calendar.
FR27: Users can view, replace, or remove a Fit assigned to a day.
FR28: The Home tab shows today's planned Fit, or a prompt to plan one if none is set; marking it worn from Home records a wear entry.
FR29: Users can export a Fit's rendered collage image to the iOS share sheet.
FR30: All wardrobe, Fit, and account data is private to its owner; no other user can read or write it.
FR31: Deleting an item, a Fit, or an account removes the corresponding database rows and stored images.
FR32: The system reads and writes directly against Supabase (Postgres + Storage) over the network; there is no offline mode or local-first storage in Phase 1.
FR33: The system records funnel analytics events (signup, item added, Fit created, Fit worn, Fit planned, etc.) and crash reports from first launch.
FR34: Users can see their current consecutive-day wear streak, computed from existing Fit-worn records; no new logging mechanism and no reminder notifications (added mid-breakdown per SPEC.md CAP-11).

Excluded from this Phase 1 breakdown (present in Fittr MVP Requirements.md but marked as non-goals in SPEC.md): social posting/feed, likes, comments, follows, saves, discover, notifications, username-based search, AI-based category detection, outfit recommendations/AI stylist, weather-aware recommendations, commerce/marketplace, Android/web.

### NonFunctional Requirements

NFR1: Minimum supported OS is iOS 17.0, required by the on-device background-removal module.
NFR2: Background removal runs on-device, not via a network API.
NFR3: The app requires network connectivity for all reads and writes; there is no offline mode in Phase 1 (open question in SPEC.md: exact failure-handling behavior when the network is unavailable is still undecided).
NFR4: Original item photos are discarded once the cutout is confirmed and are never uploaded or retained.
NFR5: All Supabase tables enforce row-level security scoped to `auth.uid()`; Storage object paths are scoped per user.
NFR6: Projected Supabase free-tier storage usage must stay within limits for the launch cohort.
NFR7: No Redis, message queues, or streaming infrastructure in Phase 1.
NFR8: Supabase Storage access is abstracted behind an `ImageStore` interface so the storage backend can be swapped later.
NFR9: No custom backend or serverless functions beyond Supabase, except where a secret or trust boundary requires one.
NFR10: Ten wardrobe items can be added from photos in under three minutes by either capture method.

### Additional Requirements

- Stack: Expo SDK, React Native, TypeScript strict, Expo Router; Supabase (Postgres, Auth, Storage); TanStack Query directly against Supabase; Zustand for UI and Fit-builder session state; react-native-gesture-handler and react-native-reanimated for canvas drag/pinch/rotate; react-native-view-shot for collage export; NativeWind styling; Jest + jest-expo + React Native Testing Library + Maestro (three e2e flows before launch); GitHub Actions CI; EAS Build/Submit/Update; Sentry (crashes) and PostHog (product events).
- No starter template specified — a fresh Expo project is bootstrapped in M0.
- Data model: `profiles`, `wardrobe_items`, `fits`, `fit_items` (freeform `x, y, scale, rotation, z_index`), `fit_wears`, `planned_fits` tables in Postgres via SQL migrations; all soft-deleted (`deleted_at`) except account deletion, which hard-deletes.
- Image pipeline: resize on device → on-device background removal → dominant-color detection → thumbnail generation → user review → direct upload to Supabase Storage and insert into Postgres (no local save step, per the online-only pivot).
- Navigation: five tabs — Home, Wardrobe, Fits, Planner, Profile. Every list screen has loading, empty, and error states.
- Milestone sequence (from `milestones.md`): M0 Foundation → M1 Wardrobe → M2 Fits → M3 Planner → M4 Cloud persistence → M5 Launch readiness → M6 Cohort. Epics below follow this order.

### UX Design Requirements

`DESIGN.md`/`EXPERIENCE.md` (added post-breakdown, see Overview) govern visual and behavioral detail across every epic below — not itemized per-FR here since they cut across all UI stories rather than mapping to individual FRs.

### FR Coverage Map

FR1: Epic 1 - Sign in with Apple / email account creation
FR2: Epic 1 - Sign in and sign out
FR3: Epic 1 - Profile (username, display name, avatar)
FR4: Epic 6 - Delete account (user-facing action)
FR5: Epic 2 - Add item via camera/library
FR6: Epic 2 - On-device background removal
FR7: Epic 2 - Manual category selection
FR8: Epic 2 - Auto-detected editable color
FR9: Epic 2 - Optional name/brand/notes
FR10: Epic 2 - Filterable wardrobe grid
FR11: Epic 2 - Item detail view + Create Fit With This
FR12: Epic 2 - Edit item
FR13: Epic 2 - Delete item
FR14: Epic 2 - Library multi-select batch
FR15: Epic 2 - Rapid camera batch (shared queue with FR14)
FR16: Epic 3 - Start Fit from template or blank canvas
FR17: Epic 3 - Freeform drag/pinch/rotate/reorder canvas
FR18: Epic 3 - Collage preview
FR19: Epic 3 - Name and save Fit
FR20: Epic 3 - Edit saved Fit
FR21: Epic 3 - Delete Fit
FR22: Epic 3 - Deleted-item gap behavior
FR23: Epic 4 - My Fits grid with filters
FR24: Epic 4 - Favorite a Fit
FR25: Epic 4 - Mark Fit worn
FR26: Epic 5 - Assign Fit to a day
FR27: Epic 5 - View/replace/remove planned Fit
FR28: Epic 5 - Home today card + mark worn from Home
FR29: Epic 4 - Share Fit to iOS share sheet
FR30: Epic 6 - Privacy (RLS enforced per-table as each table ships; audited here)
FR31: Epic 6 - Account deletion cascades (rows + storage)
FR32: Epic 1 - Direct Supabase reads/writes (architecture decision, applied by every epic)
FR33: Epic 1 - Analytics/crash reporting wired (event instrumentation completed per-epic)
FR34: Epic 4 - Wear streak counter (derived from FR25's fit_wears data)

### NFR Coverage

NFR1 (iOS 17 min): Epic 1 | NFR2 (on-device removal): Epic 2 | NFR3 (network required, no offline): Epic 1 | NFR4 (discard original photo): Epic 2 | NFR5 (RLS): Epic 1 | NFR6 (storage budget gate): Epic 6 | NFR7 (no Redis/queues): Epic 6 | NFR8 (ImageStore abstraction): Epic 6 | NFR9 (no custom backend): Epic 1 | NFR10 (10 items/3min): Epic 2

## Epic List

### Epic 1: Accounts & Foundation
Users can create an account with Sign in with Apple or email/password, sign in, sign out, and set up a display name and optional avatar — on a working Expo app wired directly to Supabase (Postgres + Auth, RLS from the first table), with CI, Sentry, and PostHog already recording the signup event. Establishes the online-only, no-custom-backend architecture every later epic builds directly against.
**FRs covered:** FR1, FR2, FR3, FR32, FR33
**NFRs covered:** NFR1, NFR3, NFR5, NFR9

### Epic 2: Wardrobe Capture & Management
Users can add clothing items from the camera or photo library — one at a time, as a library multi-select batch, or via rapid camera capture — through on-device background removal and auto-detected editable color, then browse a category-filterable grid, open item detail, edit, or delete any item.
**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15
**NFRs covered:** NFR2, NFR4, NFR10

### Epic 3: Fit Building
Users can start a Fit from a template or a blank canvas, add wardrobe items from any category onto a freeform canvas, drag/pinch/rotate/reorder them, preview the collage, name and save the Fit, reopen it for editing, delete it, and see a clear gap (not a broken Fit) if one of its items is later deleted.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR22

### Epic 4: My Fits & Sharing
Users can browse saved Fits in a grid filterable to All/Favorites/Worn, favorite a Fit, mark one worn, see their current wear streak, and export a Fit's collage to the iOS share sheet.
**FRs covered:** FR23, FR24, FR25, FR29, FR34

### Epic 5: Planner
Users can assign a saved Fit to a day on a weekly calendar, view/replace/remove that assignment, and see today's planned Fit on Home, with the option to mark it worn directly from there.
**FRs covered:** FR26, FR27, FR28

### Epic 6: Launch Readiness & Account Lifecycle
Users can delete their account and have every row and stored image actually removed; onboarding guides a new user to their first 5 items and first Fit; every list has proper loading/empty/error states; the three Maestro end-to-end flows pass; and storage/backend usage is confirmed to fit the Supabase free tier before the cohort launches.
**FRs covered:** FR4, FR30, FR31
**NFRs covered:** NFR6, NFR7, NFR8

*Not carried into an epic:* M6 Cohort (TestFlight rollout, two-week funnel review) is a post-launch operational activity with no FRs of its own — nothing to implement, so no epic.

*Note:* this folds milestones.md's M4 "Cloud persistence" into Epic 1 (architecture) plus each domain epic's own stories (each does direct Supabase CRUD as it's built), rather than keeping it as a separate epic — per your confirmation.

## Epic 1: Accounts & Foundation

Users can create an account with Sign in with Apple or email/password, sign in, sign out, and set up a display name and optional avatar — on a working Expo app wired directly to Supabase (Postgres + Auth, RLS from the first table), with CI, Sentry, and PostHog already recording the signup event.

### Story 1.1: Sign Up for an Account

As a new user,
I want to create a Fittr account with Sign in with Apple or email/password,
So that I have a private place to build my digital wardrobe.

**Acceptance Criteria:**

**Given** the Welcome screen
**When** I tap "Sign in with Apple"
**Then** Supabase Auth creates my account via Apple's identity token and I land on onboarding

**Given** the Welcome screen
**When** I choose "Continue with email" and submit a valid email/password
**Then** Supabase Auth creates my account and I land on onboarding

**Given** an email that's already registered
**When** I try to sign up with it
**Then** I see a clear "account already exists — sign in instead" error

**And** a `profiles` row is created for my account with row-level security enforcing `id = auth.uid()`, and a `signed_up` event (with `method`) is recorded and reaches PostHog

*Implementation note: this story also bootstraps the Expo/Router/NativeWind project, the Supabase project with its first migration (`profiles` + RLS) and CI (lint/typecheck/test), and wires the Sentry/PostHog SDKs. Establishes NFR1 (iOS 17 deployment target), NFR5 (RLS), NFR9 (no custom backend).*

### Story 1.2: Sign In and Sign Out

As a returning user,
I want to sign in with my existing credentials and sign out when I'm done,
So that I can securely access my own data.

**Acceptance Criteria:**

**Given** a registered account
**When** I sign in with Apple or with correct email/password
**Then** I land on Home with my data loaded directly from Supabase

**Given** incorrect email/password
**When** I try to sign in
**Then** I see a clear invalid-credentials error and remain signed out

**Given** I am signed in
**When** I tap Sign Out on Profile
**Then** my session ends and I'm returned to the Welcome screen

**And** given no network connectivity
**When** I try to sign in
**Then** I see a clear "check your connection" message rather than a hang or crash (NFR3)

### Story 1.3: Set Up and Edit Profile

As a user,
I want to set my display name and an optional avatar during onboarding and edit them later,
So that my account reflects who I am.

**Acceptance Criteria:**

**Given** I just signed up
**When** onboarding asks for a display name
**Then** I must enter one before continuing

**Given** onboarding
**When** I optionally pick a photo for my avatar
**Then** it uploads to Supabase Storage under my user prefix and `avatar_path` is set

**Given** I am signed in
**When** I open Profile
**Then** I can view and edit my display name and avatar at any time

**And** a unique lowercase `username` is generated and stored at onboarding (not surfaced in this UI beyond profile settings)

## Epic 2: Wardrobe Capture & Management

Users can add clothing items from the camera or photo library — one at a time, as a library multi-select batch, or via rapid camera capture — through on-device background removal and auto-detected editable color, then browse a category-filterable grid, open item detail, edit, or delete any item.

### Story 2.1: Add a Single Wardrobe Item

As a user,
I want to add a clothing item from my camera or photo library,
So that it appears in my digital wardrobe with its background removed.

**Acceptance Criteria:**

**Given** the Wardrobe tab
**When** I tap Add and pick a single library photo or take one shot
**Then** the photo is resized on-device and background removal produces a transparent PNG cutout (NFR2)

**Given** a generated cutout
**When** I review it
**Then** I see the cutout, a manually-selected category (top/bottom/shoes/outerwear/accessory — no AI detection), and an auto-detected dominant color that I can edit

**Given** the review screen
**When** I optionally enter a name, brand, or notes and confirm
**Then** the cutout and thumbnail upload to Supabase Storage, the item row inserts into a new `wardrobe_items` table (with RLS enforcing `user_id = auth.uid()`, per NFR5) in Postgres, and the original photo is discarded and never uploaded (NFR4)

**Given** background removal produces a poor cutout
**When** I review it
**Then** I can retake the photo instead of saving (no reprocessing feature)

### Story 2.2: Batch-Add Items via Library Multi-Select or Rapid Camera

As a user,
I want to add several items at once from my library or in rapid succession with the camera,
So that cataloging my wardrobe doesn't take one slow item at a time.

**Acceptance Criteria:**

**Given** the Wardrobe tab
**When** I choose "library multi-select" and pick several photos
**Then** each photo processes into the same shared queue-and-review screen used by Story 2.1

**Given** the Wardrobe tab
**When** I choose rapid camera capture
**Then** the camera stays open across shots, each capture adds a thumbnail to a filmstrip, and review of category/color/cutout for the whole batch happens once at the end, in the same shared queue screen

**Given** a batch of 10 items
**When** I complete either capture method start to finish
**Then** the whole flow takes under three minutes (NFR10)

**And** each item in the batch is reviewed and can be individually retaken or corrected before the batch saves

### Story 2.3: Browse and Filter the Wardrobe

As a user,
I want to see all my items in a grid I can filter by category,
So that I can quickly find what I own.

**Acceptance Criteria:**

**Given** I have wardrobe items
**When** I open the Wardrobe tab
**Then** I see a grid of item thumbnails on a transparent background with a total item count

**Given** the grid
**When** I tap a category filter chip
**Then** the grid narrows to items of that category only

**Given** no items yet
**When** I open Wardrobe
**Then** I see an empty state pointing at Add Item

### Story 2.4: View, Edit, and Delete an Item

As a user,
I want to open an item's detail, correct its information, or remove it,
So that my wardrobe stays accurate.

**Acceptance Criteria:**

**Given** the Wardrobe grid
**When** I tap an item
**Then** I see its detail: large cutout, category, color, name/brand/notes, and any Fits containing it, plus a "Create Fit With This" action (enables Epic 3's Fit builder)

**Given** item detail
**When** I edit category, color, name, brand, or notes and save
**Then** the change persists to Postgres immediately

**Given** item detail
**When** I delete the item and confirm
**Then** it's soft-deleted, removed from the grid, and removed from any Fit's placement (Fit itself is untouched beyond that gap — verified fully once Epic 3 exists)

## Epic 3: Fit Building

Users can start a Fit from a template or a blank canvas, add wardrobe items from any category onto a freeform canvas, drag/pinch/rotate/reorder them, preview the collage, name and save the Fit, reopen it for editing, delete it, and see a clear gap (not a broken Fit) if one of its items is later deleted.

### Story 3.1: Build a Fit on the Canvas

As a user,
I want to start a Fit from a template or a blank canvas and freely arrange wardrobe items on it,
So that I can compose an outfit the way I actually want to wear it.

**Acceptance Criteria:**

**Given** the Fits tab
**When** I start a new Fit
**Then** I choose a template ("Top + Bottom + Shoes", "Layered Outerwear") or "Blank canvas"; a template seeds each of its category slots with initial position, scale, and stacking order, while blank canvas starts empty

**Given** the canvas
**When** I pick an item from the category tray
**Then** it's added at its template position (or centered, for blank canvas)

**Given** an item on the canvas
**When** I drag, pinch, rotate, or reorder it
**Then** it moves freely and is no longer locked to any template slot

**And** I can add multiple items per category, including several accessories, with no fixed-slot limit

### Story 3.2: Preview, Name, and Save a Fit

As a user,
I want to preview my Fit as a rendered image, name it, and save it,
So that it becomes a reusable outfit.

**Acceptance Criteria:**

**Given** items arranged on the canvas
**When** I preview the Fit
**Then** I see a rendered collage of the current arrangement (via view-shot)

**Given** the preview
**When** I save
**Then** I can name the Fit (or accept a generated default like "Fit 12"), and each item's `x, y, scale, rotation, z_index` persists to new `fits` and `fit_items` tables (both RLS-scoped to `user_id = auth.uid()`, per NFR5) in Postgres, with the collage stored as the Fit's `cover_path`

**And** the saved Fit appears in My Fits immediately after saving (verified fully once Epic 4 exists)

### Story 3.3: Edit and Delete a Fit

As a user,
I want to reopen a saved Fit to change it, or delete it entirely,
So that my Fits stay current.

**Acceptance Criteria:**

**Given** a saved Fit
**When** I choose to edit it
**Then** the canvas reopens with every item at its saved position, scale, rotation, and stacking order

**Given** I make changes and save again
**Then** the Fit's placements and cover image update in place

**Given** a saved Fit
**When** I delete it and confirm
**Then** it's soft-deleted along with any `planned_fits` rows referencing it, while its wear history is kept

### Story 3.4: Fit Behavior When a Wardrobe Item Is Deleted

As a user,
I want a Fit to survive the deletion of one of its items,
So that I don't lose an outfit just because I got rid of one piece.

**Acceptance Criteria:**

**Given** a Fit with multiple items
**When** one of those items is deleted from the wardrobe
**Then** the Fit keeps its remaining items and shows a visible gap at the deleted item's canvas position, rather than the Fit being deleted

**Given** a Fit left with zero items after deletions
**When** I open it
**Then** it still exists but shows as empty and prompts me to add items

## Epic 4: My Fits & Sharing

Users can browse saved Fits in a grid filterable to All/Favorites/Worn, favorite a Fit, mark one worn, see their current wear streak, and export a Fit's collage to the iOS share sheet.

### Story 4.1: Browse and Filter My Fits

As a user,
I want to see all my saved Fits in one place and filter them,
So that I can find the one I want to wear or revisit.

**Acceptance Criteria:**

**Given** I have saved Fits
**When** I open the Fits tab
**Then** I see a grid of collage covers

**Given** the grid
**When** I filter to Favorites or Worn
**Then** only Fits matching that filter show; "All" shows every Fit

**Given** a Fit
**When** I tap it
**Then** I see its detail: collage, item list, and actions (Favorite, Wear today, Plan, Share, Edit, Delete)

### Story 4.2: Favorite a Fit and Mark It Worn

As a user,
I want to mark a Fit as a favorite or as worn,
So that I can track which outfits I love and which I've actually worn.

**Acceptance Criteria:**

**Given** a Fit's detail
**When** I tap Favorite
**Then** `is_favorite` toggles and it appears/disappears from the Favorites filter accordingly

**Given** a Fit's detail
**When** I tap "Wear today"
**Then** a row is written to a new `fit_wears` table (RLS-scoped to `user_id = auth.uid()`, per NFR5) for today's date

**Given** a Fit has at least one wear row
**Then** it appears under the Worn filter — "worn" status is derived, not a separate flag

### Story 4.3: Share a Fit

As a user,
I want to export a Fit's collage image,
So that I can share it outside the app however I like.

**Acceptance Criteria:**

**Given** a Fit's detail
**When** I tap Share
**Then** the rendered collage image opens in the iOS share sheet

**Given** the share sheet
**When** I choose any destination (Messages, Photos, etc.)
**Then** it receives a correct, fully-rendered collage image — no partial or placeholder image

### Story 4.4: See Your Wear Streak

As a user,
I want to see how many consecutive days I've marked a Fit worn,
So that I have a reason to keep coming back.

**Acceptance Criteria:**

**Given** I've marked a Fit worn on each of the last N consecutive calendar days (including today)
**Then** I see a streak count of N

**Given** yesterday has no `fit_wears` entry but today does
**When** the streak recomputes
**Then** it resets to 1 rather than continuing a prior chain

**Given** I haven't marked anything worn today
**When** I view the streak
**Then** it still reflects the last completed streak rather than showing 0 prematurely (streak breaks only once a day passes with nothing logged)

**And** no notifications or reminders are sent for the streak — it's a passive display only, consistent with the no-notifications non-goal

## Epic 5: Planner

Users can assign a saved Fit to a day on a weekly calendar, view/replace/remove that assignment, and see today's planned Fit on Home, with the option to mark it worn directly from there.

### Story 5.1: Plan Fits for the Week

As a user,
I want to assign saved Fits to specific days on a weekly calendar,
So that I know what I'm wearing ahead of time.

**Acceptance Criteria:**

**Given** the Planner tab
**When** I view the week strip
**Then** each day cell shows the planned Fit's cover image, or is empty if none is assigned

**Given** an empty or filled day
**When** I tap it
**Then** I can pick a Fit to assign, replace the existing assignment, or remove it — writing to a new `planned_fits` table (RLS-scoped to `user_id = auth.uid()`, per NFR5) with `planned_on` unique per user and day

**Given** a Fit assigned to a day
**When** I view that day again
**Then** the same Fit still shows correctly

### Story 5.2: See and Act on Today's Planned Fit from Home

As a user,
I want to see what I planned to wear today right on Home, and mark it worn from there,
So that I don't have to go dig through the Planner every morning.

**Acceptance Criteria:**

**Given** a Fit is planned for today
**When** I open Home
**Then** I see its cover and name; given none is planned, I see a prompt to plan one

**Given** today's planned Fit card on Home
**When** I tap "mark worn"
**Then** a `fit_wears` row is written for today, feeding both the Worn filter (Story 4.2) and the wear streak (Story 4.4)

## Epic 6: Launch Readiness & Account Lifecycle

Users can delete their account and have every row and stored image actually removed; onboarding guides a new user to their first 5 items and first Fit; every list has proper loading/empty/error states; the three Maestro end-to-end flows pass; and storage/backend usage is confirmed to fit the Supabase free tier before the cohort launches.

### Story 6.1: Guided Onboarding to First Fit

As a new user,
I want a guided onboarding step for adding my first 5 items,
So that I quickly get to a place where creating a Fit is useful.

**Acceptance Criteria:**

**Given** I just set up my profile (Story 1.3)
**When** onboarding begins
**Then** I see an "Add your first 5 items" step with a progress indicator, skippable at any time

**Given** I have fewer than 5 items and no Fit yet
**When** I open Home
**Then** I see an onboarding progress card prompting the next action

**Given** I reach 5 items and create my first Fit
**Then** the progress card disappears and an `onboarding_completed` event (with `items_added`) is recorded

### Story 6.2: Delete Account

As a user,
I want to permanently delete my account and everything in it,
So that I control my own data.

**Acceptance Criteria:**

**Given** Profile
**When** I choose Delete Account
**Then** I see a confirmation with an explanation of what will be removed

**Given** I confirm deletion
**Then** every row I own across `profiles`/`wardrobe_items`/`fits`/`fit_items`/`fit_wears`/`planned_fits` is hard-deleted, every storage object under my user prefix is removed, and finally the Supabase auth user is deleted

**Given** deletion completes
**Then** I'm signed out and returned to Welcome; an `account_deleted` event is recorded before deletion finishes

### Story 6.3: Loading, Empty, and Error States Everywhere

As a user,
I want every list screen to clearly show what's happening,
So that I'm never staring at a blank or broken screen.

**Acceptance Criteria:**

**Given** any list screen (Wardrobe, My Fits, Planner)
**When** data is loading
**Then** I see a loading state, not a blank screen

**Given** a list with nothing in it
**Then** I see an empty state pointing at the next action in the core loop

**Given** a network or server error while loading a screen
**Then** I see a clear error state, not a crash or infinite spinner

**And** a review confirms row-level security actually rejects cross-user reads/writes on every table (FR30)

### Story 6.4: Pre-Launch Verification

As the team,
We want to verify the app is actually ready to hand to a cohort,
So that launch criteria are met before real users arrive.

**Acceptance Criteria:**

**Given** the three defined Maestro flows
**When** run against a build
**Then** all three pass with no crashes

**Given** projected image and row volume for the launch cohort
**When** checked against Supabase's free tier
**Then** usage is confirmed to stay within limits (or a mitigation is documented)

**Given** the codebase
**When** audited
**Then** no Redis, queue, or streaming infrastructure exists, and all image storage access goes through the `ImageStore` interface

**And** App Store assets (screenshots, listing copy, icon) are ready for submission

## Validation Summary

- **FR coverage:** all 34 FRs traced to a specific story's acceptance criteria; none uncovered.
- **NFR coverage:** all 10 NFRs traced to a specific story or epic-level implementation note.
- **Table creation:** each of the six tables (`profiles`, `wardrobe_items`, `fits`/`fit_items`, `fit_wears`, `planned_fits`) is created only in the first story that needs it, each with RLS stated explicitly (fixed during this validation pass — the first draft stated RLS only for `profiles`).
- **No starter template:** none specified; Story 1.1 bootstraps the project as part of delivering account creation, not as a separate infra-only story.
- **Forward dependencies:** none block story completion. Stories 2.4 and 3.2 note that a feature (Create Fit With This, appearing in My Fits) is *enabled* by a later epic, but neither story requires that later epic to exist to be built or tested — same pattern approved for epic-level sequencing.
- **Epic independence:** Epics 2-5 each deliver complete, standalone domain value and depend only on earlier epics' outputs; Epic 6 is a closing launch-readiness epic and, as such, is expected to depend on everything before it.
- **File churn:** Epic 6's states/RLS audit revisits screens built in Epics 2-5, but as a deliberate final hardening pass across a now-complete app, not arbitrary technical-layer splitting.

**All validations complete!** [C] Complete Workflow
