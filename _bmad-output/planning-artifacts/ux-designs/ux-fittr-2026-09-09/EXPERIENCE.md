---
name: Fittr
status: final
sources:
  - _bmad-output/specs/spec-phase-1/SPEC.md
  - _bmad-output/specs/spec-phase-1/screens-and-flows.md
  - _bmad-output/specs/spec-phase-1/product-context.md
  - _bmad-output/specs/spec-phase-1/data-model.md
  - _bmad-output/planning-artifacts/epics.md
updated: 2026-09-10
---

# Fittr — Experience Spine

> Single-surface native iOS app (Expo/React Native + NativeWind, min iOS 17). No UI system named — inherits iOS platform conventions for navigation, system gestures, and Dynamic Type. `DESIGN.md` is the visual identity reference; this spine is the experience. Light and dark mode both supported.

## Foundation

Single-surface, iOS only, phone form factor (no tablet layout in Phase 1). Standard iOS tab-bar navigation, no custom drawer or hamburger. No offline mode — every read and write requires network connectivity (SPEC.md CAP-8/NFR3); this shapes several State Patterns below.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Welcome / Sign up / Sign in | Cold app open, signed out | Sign in with Apple, Google, or email/password |
| Onboarding | First sign-up | Display name, avatar, guided "add 5 items" |
| Home | Tab bar | Today's planned Fit, quick actions, onboarding progress |
| Wardrobe | Tab bar | Filterable item grid |
| Add item (library / rapid camera) | Wardrobe "Add" | Capture, batch queue, review |
| Item detail | Wardrobe grid tap | View/edit/delete one item; "Create Fit With This" |
| Fit builder | Item detail, My Fits "new Fit", Home quick action | Template pick + freeform canvas |
| My Fits | Tab bar | Filterable Fit grid (All/Favorites/Worn) |
| Fit detail | My Fits grid tap | Collage, items, Favorite/Wear/Plan/Share/Edit/Delete |
| Planner | Tab bar | Week strip, assign/replace/remove |
| Profile | Tab bar | Display name, avatar, sign out, delete account |

Bottom tab bar: Home / Wardrobe / Fits / Planner / Profile — five items, at the platform maximum. Modal/sheet stacks one level deep (e.g., a confirmation sheet over Fit detail), never two.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md.Brand & Style`.

| Do | Don't |
|---|---|
| "Fit saved." | "Yay! Your Fit is saved! 🎉" |
| "No connection — nothing was lost. Try again." | "Network error" |
| "Add your first 5 items." | "Let's get started!! ✨" |
| Short, complete sentences; no exclamation marks | Gamified encouragement, streak hype copy |
| "3-day streak" (plain number + noun) | "🔥 You're on fire! 3 days!" |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Add-item flow | Wardrobe | Single photo: capture/pick → resize → on-device cutout → category (manual) + color (auto, editable) → optional name/brand/notes → save direct to Supabase. Poor cutout → retake, no reprocessing. |
| Batch queue | Wardrobe (library multi-select or rapid camera) | One shared queue/review screen for both entry points; each item individually confirmable/retakeable before the batch saves. |
| Fit canvas | Fit builder | Template seeds initial `x, y, scale, rotation, z_index`; freeform drag/pinch/rotate/reorder after that — nothing stays "locked" to a template slot. Multiple items per category allowed. → `mockups/fit-builder-canvas.html` |
| Fit save | Fit builder | Renders collage via view-shot, writes `fits`/`fit_items`, generates default name ("Fit 12") if none given. → `mockups/fit-builder-canvas.html` |
| Favorite toggle | Fit detail, My Fits | Tap to toggle; immediate visual state change, no confirmation step. |
| Wear today | Fit detail, Home | Writes a `fit_wears` row for today; feeds both the Worn filter and the wear-streak count. |
| Planner day cell | Planner | Tap → pick/replace/remove a Fit for that day; one Fit per day, unique per user+day. |
| Delete (item/Fit/account) | Item detail, Fit detail, Profile | Always a confirmation step first; account deletion additionally explains what gets removed before confirming. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Loading | Any list (Wardrobe, My Fits, Planner) | Skeleton grid/list matching the eventual layout — never a bare spinner on its own. |
| Empty | Wardrobe | "Add your first item." → Add-item flow. |
| Empty | My Fits | "Build your first Fit." → Fit builder. |
| Empty | Planner (a given day) | Blank day cell, tap to assign — no copy needed, the affordance is visual. |
| Fit with a removed item | Fit detail / canvas | Remaining items keep their positions; the removed item's spot shows a visible gap, not a broken layout. Zero items left → Fit still exists, shown as empty with a prompt. |
| No connection during a save | Add-item, Fit save, any write | Block-and-keep (confirmed): show "No connection — nothing was lost. Try again," keep the user on the unsaved screen with their input intact, offer a retry action. No silent background queue (there's no local-first layer to queue against safely in Phase 1). |
| No connection during sign-in | Welcome | "Check your connection and try again," remain on the sign-in screen. |
| Sync/background failure | Any screen, post-save | Small non-blocking indicator only — never a modal, never blocks continued use. |
| Delete-account failure mid-cascade | Profile | Surfaced clearly with a retry; account remains in place (not partially deleted) until the whole cascade confirms. |

## Interaction Primitives

- Tap for all primary actions (add, save, favorite, wear, plan).
- Drag, pinch, and rotate on the Fit-builder canvas only — this is the one surface with rich gesture input; every other surface uses standard tap/scroll.
- Long-press: not used in Phase 1 (reserved for a future "quick actions" affordance, not built now — avoid claiming it prematurely).
- Swipe: standard iOS back-swipe only; no custom swipe-to-delete or swipe-action rows in Phase 1 (delete goes through item/Fit detail, not a list-row swipe).
- Pull-to-refresh: available on Wardrobe and My Fits as a standard native affordance, not required for correctness (data is always live from Supabase).
- **Banned:** carousels, autoplay/hero animations on screen open, badge counts (no notifications), any gesture that competes with the iOS edge-swipe-back gesture.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- VoiceOver: every icon-only control (tab bar items, favorite heart, close/back buttons) has an accessible label; the wear-streak count announces as "N day streak," not just the bare number.
- Dynamic Type: since `display`/`title`/`body` use custom fonts (Newsreader/Montserrat), components must scale against the user's font-size setting explicitly — verified at the largest accessibility size with no truncation or overlap, especially on the Fit-builder canvas where item labels sit over photography.
- Reduce Motion: skip the wear-streak increment animation and any press-spring easing; show the end state immediately.
- Touch targets ≥44×44pt everywhere, including wardrobe/Fit grid cells and canvas items — use `hitSlop` when the visual cutout is smaller than that.
- Fittr has no accent color at all — favorited/active/selected states are shown through weight and fill-vs-outline (see `DESIGN.md.Components`), which also means color is never relied on as a signal anywhere in the product.

## Inspiration & Anti-patterns

- **Lifted from Whering / Acloset / Stylebook** (named in SPEC.md's own decision log as the category standard): freeform, template-seeded canvas rather than fixed outfit slots — items aren't locked once placed.
- **Lifted from editorial fashion apps generally:** restrained, near-monochrome UI so photography of real clothing is the only color story on screen.
- **Rejected — gamified habit-app patterns (streak flames, celebratory confetti, push reminders):** the wear streak is a quiet passive counter, not a re-engagement mechanic — no notifications exist in Phase 1, and the counter itself avoids fire/celebration iconography to stay in the brand's restrained register.
- **Rejected — social-feed patterns (likes, comments, discover feed):** explicitly out of scope for Phase 1; nothing in the IA above should be shaped to anticipate them.

## Responsive & Platform

- Phone-only, no tablet-specific layout in Phase 1; verify on both a small phone (e.g. SE-class width) and a large phone, portrait only (the Fit canvas and grids are not designed for landscape).
- Safe areas respected for the tab bar and any bottom sheet/CTA — nothing tappable sits under the home indicator or a notch/Dynamic Island.
- Native share sheet (`Share` action) and native confirmation/action sheets used for destructive confirmations — no custom-built equivalents.

## Key Flows

### Flow 1 — First Fit (Rowan, first session, five minutes after downloading)

1. Rowan signs up with Sign in with Apple (Google and email/password are the other two entry points).
2. Onboarding asks for a display name, then starts the guided "add your first 5 items" step.
3. Rowan photographs five pieces with rapid camera capture — the camera stays open, a filmstrip fills up at the bottom.
4. Rowan reviews the batch once at the end: confirms category and color for each, retakes one poor cutout.
5. Home now shows the onboarding progress card at "5/5 items — build your first Fit."
6. Rowan taps in, picks the "Top + Bottom + Shoes" template, swaps in their own items, nudges the jacket's position with a drag (see `mockups/fit-builder-canvas.html`).
7. Names it, saves.
8. **Climax:** the Fit's collage renders and Home's onboarding card disappears — replaced by a prompt to plan it for tomorrow.

Failure: rapid-camera batch save fails for no connection → batch stays in the queue, unsaved, with a clear retry — Rowan doesn't lose the five photos already captured on-device before the save step.

### Flow 2 — Plan and wear (Rowan, Sunday evening, a week later)

1. Rowan opens Planner, taps Monday, assigns last week's "Top + Bottom + Shoes" Fit.
2. Repeats for Tuesday and Wednesday with two other saved Fits.
3. Monday morning, Home shows the planned Fit's cover.
4. Rowan taps "mark worn" directly from Home.
5. **Climax:** the wear-streak count on My Fits ticks from 2 to 3 — a quiet, plain-number confirmation that the habit is sticking, with no celebration graphics.

Empty state: no Fit planned for today → Home shows a plain prompt to plan one, linking to Planner.

## Open Items

- **Localization:** assumed English-only for Phase 1; no i18n requirement found anywhere in the source material. Low-stakes, non-blocking.
- **Log back to SPEC.md:** the no-connection save behavior above (block-and-keep) resolves SPEC.md's open question about save failure handling — log it there via `bmad-spec`.
