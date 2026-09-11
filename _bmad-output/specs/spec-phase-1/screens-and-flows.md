# Screens and flows

### Navigation
Tabs: Home, Wardrobe, Fits, Planner, Profile.

### Auth and onboarding
- Welcome: value proposition in one line, Sign in with Apple, Continue with email.
- Sign up and sign in with email; password reset via email.
- Onboarding: set display name, then a guided "Add your first 5 items" step with a progress indicator. Skippable.

### Home
- Today's planned Fit, or a prompt to plan one.
- Quick actions: Add item, Create Fit.
- Onboarding progress card until the user has 5 items and 1 Fit.

### Wardrobe
- Grid of thumbnails on transparent background, category filter chips, item count.
- Add item button opens a choice of library multi-select or rapid camera capture (see `image-pipeline.md`).
- Processing queue screen with per-photo status and a review step for each.
- Item detail: large cutout, category, color, name, brand, notes, "Fits with this item", Create Fit With This, Edit, Delete.

### Fit builder
- Start by choosing a template (e.g. "Top + Bottom + Shoes", "Layered Outerwear", "Blank canvas") that seeds initial position, scale, and stacking order for each category slot it defines.
- A freeform canvas: pick an item from a category tray, it's added to the canvas at its template position (or center, for a blank canvas), and the user can drag, pinch to resize, rotate, and reorder layers freely. Nothing is locked to a slot after placement.
- Multiple items per category allowed, including several accessories.
- Name field with generated default. Save persists each item's `x, y, scale, rotation, z_index`.
- Editing a Fit reopens the canvas with items at their saved positions.
- Save renders the canvas to an image via view-shot for the Fit's cover and for share/export.

### My Fits
- Grid of collage covers, filters All, Favorites, Worn.
- Fit detail: collage, item list, actions Favorite, Wear today, Plan, Share, Edit, Delete.

### Planner
- Week strip with day cells showing the planned Fit's cover.
- Tap a day to pick a Fit, replace, or remove.
- Marking a planned Fit as worn from Home writes a wear row.

### Profile
- Username, display name, avatar, sign out.
- Delete account with confirmation and explanation.

### States
Every list has loading, empty, and error states. Empty states point at the next action in the core loop.
