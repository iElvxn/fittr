---
name: Fittr
description: Classic, pure-monochrome wardrobe app for a fashion-minded user — the clothing photo is the only color anywhere, the UI stays quiet.
status: final
updated: 2026-09-10
colors:
  surface-base: '#FAFAF9'
  surface-raised: '#FFFFFF'
  ink-primary: '#1C1917'
  ink-secondary: '#78716C'
  ink-disabled: '#A8A29E'
  border-hairline: '#E7E5E4'
  destructive: '#DC2626'
  surface-base-dark: '#171412'
  surface-raised-dark: '#211D1A'
  ink-primary-dark: '#F5F3F1'
  ink-secondary-dark: '#A39C93'
  ink-disabled-dark: '#6B6560'
  border-hairline-dark: '#332E29'
  destructive-dark: '#F87171'
typography:
  display:
    fontFamily: Cormorant
    fontWeight: 600
  title:
    fontFamily: Cormorant
    fontWeight: 500
  body:
    fontFamily: Montserrat
    fontWeight: 400
  label:
    fontFamily: Montserrat
    fontWeight: 500
  meta:
    fontFamily: Montserrat
    fontWeight: 400
    fontSize: 13px
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  gutter: 16px
components:
  button-primary:
    background: '{colors.ink-primary}'
    text: '{colors.surface-raised}'
    rounded: '{rounded.sm}'
    paddingX: '{spacing.6}'
    paddingY: '{spacing.3}'
  button-secondary:
    background: transparent
    border: '{colors.ink-primary}'
    text: '{colors.ink-primary}'
    rounded: '{rounded.sm}'
  card:
    background: '{colors.surface-raised}'
    rounded: '{rounded.md}'
    padding: '{spacing.6}'
    shadow: sm
  wardrobe-grid-item:
    background: transparent
    aspectRatio: '1:1'
    tapAreaRounded: '{rounded.sm}'
  tab-bar:
    background: '{colors.surface-raised}'
    activeStyle: 'ink-primary icon + bold label'
    inactiveStyle: 'ink-secondary icon + regular label'
    iconStyle: Phosphor thin (regular) / Phosphor bold (active), single family
  sheet:
    background: '{colors.surface-raised}'
    roundedTop: '{rounded.lg}'
  favorite-indicator:
    inactive: 'outline heart, ink-secondary'
    active: 'filled heart, ink-primary'
  canvas-item-selected:
    border: '{colors.ink-primary}'
    borderWidth: 2px
---

## Brand & Style

Fittr is a fashion-minded person's private wardrobe, not a social feed and not a spreadsheet. The visual language is closer to a well-edited fashion magazine than a productivity app: pure monochrome surfaces and a serif display face reserved for the moments that deserve it (a Fit's name, a screen title) — never for dense lists. There is no brand accent color. Restraint itself is the statement — and the safer choice: a "tasteful" accent color is the easiest way to end up looking like a generic template instead of something a fashion-literate person would actually choose.

The governing discipline is restraint. Every screen's real content is a photograph of clothing with the background removed; the UI's job is to disappear so that photo reads clearly. No gradients, no decorative texture, no chromatic color anywhere in the chrome. When in doubt, remove.

## Colors

Pure monochrome. Every UI surface, text color, and control is black, white, or a shade of warm gray — the only color in the entire app is whatever the user's own clothing photos contribute.

- **Warm Ink (`{colors.ink-primary}`)** is the primary text color, the fill for primary buttons, and the outline color for secondary actions. Warmer than pure black on purpose — closer to a printed page than a screen.
- **Warm White (`{colors.surface-base}`)** is the app background; **Pure White (`{colors.surface-raised}`)** lifts cards and the tab bar just enough to separate them from the background without a visible shadow doing the work.
- **Hairline (`{colors.border-hairline}`)** separates list rows and grid cells at the lowest contrast that's still visible — a line, not a box.
- **Destructive (`{colors.destructive}`)** is one exception to "no color" — a system-level red reserved for delete confirmations and error text only, never decorative, never a badge. It signals danger, not brand.
- **Google's "G" logomark** (Sign-In button only) is the other exception — Google's brand guidelines require its official multi-color mark, uneditable. It appears at icon size only, inside an otherwise monochrome button (ink outline or fill, standard `body`-type label); nothing else on that button, or anywhere else in the app, picks up color from it.

State (favorited, active tab, selected canvas item) is never shown by introducing color — see Components below for the weight/fill-vs-outline treatment each one uses instead. Avoid: any chromatic accent color, however subtle it seems in isolation; gradients; and color as the only signal for state (see the Accessibility Floor in `EXPERIENCE.md`).

## Typography

- **`display`** (Cormorant, 600) is for the rare hero moment: a Fit's name on its own detail screen, the onboarding headline. Used once per screen at most.
- **`title`** (Cormorant, 500) is every screen's header — "Wardrobe," "My Fits," an item's category.
- **`body`** (Montserrat, 400) is everything else that's read at length: item names, brand/notes text, form labels, button text.
- **`label`** (Montserrat, 500) is for compact UI text that needs a touch more weight than body: tab labels, filter chips, the wear-streak number.
- **`meta`** (Montserrat, 400, 13px) is for secondary information that should recede: item counts, dates, timestamps.

Because Cormorant and Montserrat are custom (not platform-native) fonts, they don't scale automatically with iOS Dynamic Type the way system fonts do — every text component must read the user's font-scale setting and multiply its base size accordingly, not just set `allowFontScaling` and hope. Verified at the largest accessibility text size before any screen ships (see `EXPERIENCE.md` Accessibility Floor).

## Layout & Spacing

Scale: `{spacing.1}`–`{spacing.7}` (4 to 48px). `{spacing.gutter}` (16px) is the horizontal screen margin throughout — consistent on every screen, never widened for "breathing room" on one screen and not another. Grid gaps in the Wardrobe and My Fits grids use `{spacing.2}` (8px) between cells; section spacing between major blocks (e.g., Home's planned-Fit card and the onboarding progress card) uses `{spacing.6}` (32px).

Single column throughout — no multi-pane layout, this is a single-surface phone app. Grids are the exception (Wardrobe, My Fits), and even there each cell is a single unit, not a compound layout.

## Elevation & Depth

Minimal. Cards sit on `{colors.surface-raised}` against `{colors.surface-base}` — the tonal difference alone usually carries enough separation. Where a shadow is used (the tab bar lifting off content scrolling beneath it, a bottom sheet), it's the lightest value that still reads, never a heavy drop shadow. Photography (wardrobe cutouts, Fit collages) never gets a shadow of its own — the transparent PNG sits directly on the surface color.

## Shapes

`{rounded.sm}` (8px) for inputs, buttons, filter chips, and the tap-area behind wardrobe grid items (the cutout image itself is unmasked — only its invisible tap target is rounded). `{rounded.md}` (12px) for cards. `{rounded.lg}` (16px) for the top corners of bottom sheets and modals. `{rounded.full}` for the avatar and any circular icon buttons only.

Nothing in between these four values — a consistent radius scale reads as intentional; arbitrary corner values read as sloppy.

## Components

- **Tab bar** — five items (Home, Wardrobe, Fits, Planner, Profile), Phosphor icons, label beneath each. Active tab: `{colors.ink-primary}` icon + bold label. Inactive: `{colors.ink-secondary}` icon + regular-weight label — the distinction is weight, not color. No badges (no notifications in this product).
- **Wardrobe / My Fits grid cell** — the cutout or collage image, transparent background, no card chrome. A category or filter chip may appear as an overlay label using `label` type on a small `{colors.surface-raised}` pill at 90% opacity.
- **Fit-builder canvas** — full-bleed `{colors.surface-base}` canvas; items float on it with no per-item card background (they're already cutouts). Selected item gets a solid `{colors.ink-primary}` outline (2px), not a shadow or scale change, so it doesn't compete with the drag/rotate gesture itself. See `mockups/fit-builder-canvas.html` for a visual reference (template picker + populated canvas states) — note the mock's black selection outline supersedes the gold shown in an earlier draft.
- **Primary button** — solid `{colors.ink-primary}` fill, white text, `{rounded.sm}`. One per screen.
- **Secondary button** — `{colors.ink-primary}` outline and text, transparent fill. Primary/secondary hierarchy comes from fill-vs-outline, not from a second color.
- **Sign-in method buttons** (Apple / Google / email, Welcome screen) — same secondary-button treatment, stacked full-width. Google's button carries its required "G" logomark (the one other color exception, see Colors); Apple and email buttons stay fully monochrome with a platform-standard Apple mark / no mark respectively.
- **Favorite indicator** — a thin outline heart (`{colors.ink-secondary}`) that fills solid `{colors.ink-primary}` when active. The change is outline-to-filled, not a color swap.
- **Wear-streak counter** — `label` type in `{colors.ink-primary}`, a number and the word "day streak" — plain numerals, no flame/fire iconography (too playful for this brand) and no celebratory animation or color beyond the number update itself.
- **Item detail / Fit detail** — the photo dominates the top of the screen edge-to-edge (minus gutter), metadata in `body`/`meta` below, actions as a row of secondary buttons or icon buttons beneath that.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Pure black/white/gray everywhere in the chrome | Add any chromatic accent color, including a "tasteful" one, or default icon-library colors |
| Let the clothing photo be the only color on screen | Add card chrome, shadows, or borders around wardrobe/Fit photography |
| Thin-stroke Phosphor icons, one family throughout | Mix icon families, or use color to distinguish icon states |
| A single `display`-type moment per screen | Stack multiple large serif headlines on one screen |
| Weight and fill-vs-outline for state (favorited, active tab, selected) | Color alone (or at all) to signal state |
| Flat surfaces, tonal separation only | Gradients, decorative texture, drop shadows on photography |
