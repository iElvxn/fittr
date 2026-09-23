---
name: Fittr
description: Refined, fashion-literate wardrobe app (Pinterest/Depop/Aesop) — cream-and-ink pure monochrome; the clothing photo is the only color anywhere, the UI stays quiet.
status: final
version: 2
updated: 2026-09-23
colors:
  surface-base: '#F6F4EE'
  surface-raised: '#FFFDF8'
  surface-tile: '#ECE8DF'
  ink-primary: '#252220'
  ink-secondary: '#766E64'
  ink-disabled: '#A8A095'
  border-hairline: '#E4DFD6'
  destructive: '#B91C1C'
  surface-base-dark: '#1A1816'
  surface-raised-dark: '#24211E'
  surface-tile-dark: '#2A2622'
  ink-primary-dark: '#EDE8DF'
  ink-secondary-dark: '#A39B90'
  ink-disabled-dark: '#6B645C'
  border-hairline-dark: '#35302B'
  destructive-dark: '#F87171'
typography:
  display:
    fontFamily: Newsreader
    fontWeight: 400
    fontSize: 36px
    lineHeight: 40px
    letterSpacing: -0.4
  title:
    fontFamily: Newsreader
    fontWeight: 400
    fontSize: 24px
    lineHeight: 30px
  body:
    fontFamily: Montserrat
    fontWeight: 400
    fontSize: 16px
    lineHeight: 22px
  label:
    fontFamily: Montserrat
    fontWeight: 500
    fontSize: 14px
    lineHeight: 20px
  meta:
    fontFamily: Montserrat
    fontWeight: 400
    fontSize: 13px
    lineHeight: 18px
  caption:
    fontFamily: Montserrat
    fontWeight: 500
    fontSize: 11px
    lineHeight: 14px
    letterSpacing: 1.5
    textTransform: uppercase
rounded:
  sm: 2px
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
    text: '{colors.surface-base}'
    type: caption
    rounded: '{rounded.sm}'
    minHeight: 48px
    paddingX: '{spacing.6}'
    paddingY: '{spacing.3}'
  button-secondary:
    background: transparent
    border: '{colors.ink-primary}'
    text: '{colors.ink-primary}'
    type: caption
    rounded: '{rounded.sm}'
    minHeight: 48px
  chip:
    type: caption
    rounded: '{rounded.sm}'
    selected: '{colors.ink-primary} fill, {colors.surface-base} text'
    unselected: '{colors.border-hairline} outline, {colors.ink-secondary} text'
  card:
    background: '{colors.surface-raised}'
    rounded: '{rounded.md}'
    padding: '{spacing.6}'
    shadow: sm
  photo:
    background: '{colors.surface-tile}'
    rounded: '{rounded.lg}'
  tab-bar:
    structure: floating frosted-glass pill with a moving active indicator
    background: '{colors.surface-raised} tint over blur'
    activeStyle: 'ink-primary icon + bold label, low-opacity ink indicator'
    inactiveStyle: 'ink-secondary icon + regular label'
    centerAction: '{colors.ink-primary} circle, {colors.surface-base} plus'
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

Fittr is a fashion-minded person's private wardrobe, not a social feed and not a spreadsheet. The visual language is closer to a well-edited fashion magazine or an Aesop shelf than a productivity app: warm cream-and-ink monochrome surfaces and a fine editorial serif (Newsreader) display face reserved for the moments that deserve it (a Fit's name, a screen title) — never for dense lists. There is no brand accent color. Restraint itself is the statement — and the safer choice: a "tasteful" accent color is the easiest way to end up looking like a generic template instead of something a fashion-literate person would actually choose.

The governing discipline is restraint. Every screen's real content is a photograph of clothing with the background removed; the UI's job is to disappear so that photo reads clearly. No gradients, no decorative texture, no chromatic color anywhere in the chrome. When in doubt, remove.

## Colors

Pure monochrome, cream and ink. Every UI surface, text color, and control is a warm off-white, a warm near-black, or a shade between — the only color in the entire app is whatever the user's own clothing photos contribute. There is no accent color.

- **Ink (`{colors.ink-primary}`)** is the primary text color, the fill for primary buttons, selected chips and the tab bar's center "+", and the outline color for secondary actions. A warm near-black — closer to a printed page than a screen. In dark mode it inverts to a warm paper white (`{colors.ink-primary-dark}`).
- **Cream (`{colors.surface-base}`)** is the app background; **Raised (`{colors.surface-raised}`)** lifts cards, sheets and the tab bar just enough to separate them without a visible shadow doing the work.
- **Tile (`{colors.surface-tile}`)** is the photo well — the fill behind clothing photography and collages. It holds photography only, never text (it is not contrast-checked for text).
- **Ink secondary (`{colors.ink-secondary}`)** is for text that should recede: metadata, inactive tabs, unselected chips.
- **Hairline (`{colors.border-hairline}`)** separates list rows and outlines unselected chips at the lowest contrast that's still visible — a line, not a box.
- **Inverse text** on an ink fill (primary button, selected chip, the "+" glyph) is always `{colors.surface-base}`, in both modes — so it flips with the scheme and never renders white-on-light in dark mode.
- **Destructive (`{colors.destructive}`)** is one exception to "no color" — a system-level red reserved for delete confirmations and error text only, never decorative, never a badge. Light mode uses `#B91C1C` because the brighter `#DC2626` measures only 4.39:1 on the cream.
- **Google's "G" logomark** (Sign-In button only) is the other exception — Google's brand guidelines require its official multi-color mark, uneditable. It appears at icon size only, inside an otherwise monochrome button; nothing else on that button, or anywhere else in the app, picks up color from it.

**Contrast floor:** ink, ink-secondary and destructive all meet WCAG AA (4.5:1) on both `surface-base` and `surface-raised`, in both modes, as does inverse text on ink. `__tests__/themeTokens.test.ts` enforces this and keeps `tailwind.config.js` and `lib/theme/colors.ts` identical.

State (favorited, active tab, selected chip, selected canvas item) is never shown by introducing color — see Components below for the weight/fill-vs-outline treatment each one uses instead. Avoid: any chromatic accent color, however subtle it seems in isolation; gradients; and color as the only signal for state (see the Accessibility Floor in `EXPERIENCE.md`).

## Typography

- **`display`** (Newsreader 400, 36/40, tracking -0.4) is for the rare hero moment: a Fit's or item's name on its own detail screen, the onboarding headline. Used once per screen at most.
- **`title`** (Newsreader 400, 24/30) is every screen's header — "Wardrobe," "My Fits," an item's category.
- **`body`** (Montserrat 400, 16/22) is everything else that's read at length: item names, brand/notes text, form labels.
- **`label`** (Montserrat 500, 14/20) is for compact UI text that needs a touch more weight than body: tab labels, the wear-streak number.
- **`meta`** (Montserrat 400, 13/18) is for secondary information that should recede: item counts, dates, timestamps.
- **`caption`** (Montserrat 500, 11/14, tracking 1.5, uppercase) is the small tracked label: button labels, filter chips, section labels ("ITEMS").

Newsreader's italic (400) is loaded for occasional editorial emphasis; it has no role of its own yet.

Because Newsreader and Montserrat are custom (not platform-native) fonts, they don't scale automatically with iOS Dynamic Type the way system fonts do — the shared `Text` component reads the user's font-scale setting and multiplies the base size, line height and letter-spacing accordingly, rather than setting `allowFontScaling` and hoping. Verified at the largest accessibility text size before any screen ships (see `EXPERIENCE.md` Accessibility Floor).

## Layout & Spacing

Scale: `{spacing.1}`–`{spacing.7}` (4 to 48px). `{spacing.gutter}` (16px) is the horizontal screen margin throughout — consistent on every screen, never widened for "breathing room" on one screen and not another. Grid gaps in the Wardrobe and My Fits grids use `{spacing.2}` (8px) between cells; section spacing between major blocks (e.g., Home's planned-Fit card and the onboarding progress card) uses `{spacing.6}` (32px).

Single column throughout — no multi-pane layout, this is a single-surface phone app. Grids are the exception (Wardrobe, My Fits), and even there each cell is a single unit, not a compound layout.

## Elevation & Depth

Minimal. Cards sit on `{colors.surface-raised}` against `{colors.surface-base}` — the tonal difference alone usually carries enough separation. Where a shadow is used (the tab bar lifting off content scrolling beneath it, a bottom sheet), it's the lightest value that still reads, never a heavy drop shadow. Photography (wardrobe cutouts, Fit collages) never gets a shadow of its own — the transparent PNG sits directly on the surface color.

## Shapes

Corners are hybrid: **controls are square, photos and sheets are soft.**

- `{rounded.sm}` (2px) — every control: inputs, buttons, filter chips, pickers. Crisp, near-square corners read tailored, not app-template.
- `{rounded.md}` (12px) — cards.
- `{rounded.lg}` (16px) — photography (the photo tile / collage frame) and the top corners of bottom sheets and modals.
- `{rounded.full}` — the avatar, the tab bar pill and its active indicator, and circular icon buttons (the "+" action) only.

Nothing in between these four values — a consistent radius scale reads as intentional; arbitrary corner values read as sloppy.

## Components

- **Tab bar** — a floating frosted-glass pill (blur under a translucent `{colors.surface-raised}` tint) with five slots: Home, Wardrobe, a center "+" (Add item), Fits, Planner. Thin-stroke icons, label beneath each. Active tab: `{colors.ink-primary}` icon + bold label, marked by a moving pill indicator of low-opacity ink. Inactive: `{colors.ink-secondary}` icon + regular-weight label — the distinction is weight, not color. The center "+" is a `{colors.ink-primary}` circle with a `{colors.surface-base}` glyph. No badges (no notifications in this product).
- **Wardrobe / My Fits grid cell** — the cutout or collage image, no card chrome or shadow; where a photo well is used it is `{colors.surface-tile}` with `{rounded.lg}` corners. A category or filter chip may appear as an overlay label using `caption` type on a small `{colors.surface-raised}` pill at 90% opacity.
- **Filter chips** — `caption` type, `{rounded.sm}`. Selected: `{colors.ink-primary}` fill with `{colors.surface-base}` text. Unselected: `{colors.border-hairline}` outline with `{colors.ink-secondary}` text. Fill-vs-outline, never color.
- **Fit-builder canvas** — full-bleed `{colors.surface-base}` canvas; items float on it with no per-item card background (they're already cutouts). Selected item gets a solid `{colors.ink-primary}` outline (2px), not a shadow or scale change, so it doesn't compete with the drag/rotate gesture itself. See `mockups/fit-builder-canvas.html` for a visual reference (template picker + populated canvas states) — note the mock's black selection outline supersedes the gold shown in an earlier draft.
- **Primary button** — solid `{colors.ink-primary}` fill, `{colors.surface-base}` text (the inverse pair, in both modes), `caption` label, `{rounded.sm}`, 48pt minimum height. One per screen.
- **Secondary button** — `{colors.ink-primary}` outline and text, transparent fill, same `caption` label, radius and height. Primary/secondary hierarchy comes from fill-vs-outline, not from a second color.
- **Sign-in method buttons** (Apple / Google / email, Welcome screen) — same secondary-button treatment, stacked full-width. Google's button carries its required "G" logomark (the one other color exception, see Colors); Apple and email buttons stay fully monochrome with a platform-standard Apple mark / no mark respectively.
- **Favorite indicator** — a thin outline heart (`{colors.ink-secondary}`) that fills solid `{colors.ink-primary}` when active. The change is outline-to-filled, not a color swap.
- **Wear-streak counter** — `label` type in `{colors.ink-primary}`, a number and the word "day streak" — plain numerals, no flame/fire iconography (too playful for this brand) and no celebratory animation or color beyond the number update itself.
- **Item detail / Fit detail** — the photo dominates the top of the screen edge-to-edge (minus gutter), the name in `display` `{colors.ink-primary}`, metadata in `body`/`meta` below, actions as a row of secondary buttons or icon buttons beneath that.
  - **Fit detail (as shipped, Story 4.3):** one scroll — back chevron left / Share icon right in the header (iOS convention); collage in a 4:5 `surface-raised` frame, `contain`, no shadow; Fit name in `display`; one uppercase tracked `meta` line (`2 ITEMS · UPDATED SEP 18, 2026`); a hairline-bordered (top + bottom) row of icon actions, in equal-width columns, each with a tiny uppercase `ink-secondary` caption (FAVORITE / WEAR TODAY↔WORN TODAY / EDIT / DELETE; wraps to two lines at large Dynamic Type sizes); icons all `ink-primary` (`ink-disabled` while busy), state by fill/glyph only; then the `ITEMS` section. Wear-today's logged state swaps `CalendarIcon`→`CheckIcon` (same family/weight) — the "state via glyph swap" convention alongside the heart's fill-vs-outline.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Cream, ink and warm gray everywhere in the chrome | Add any chromatic accent color, including a "tasteful" one, or default icon-library colors |
| Let the clothing photo be the only color on screen | Add card chrome, shadows, or borders around wardrobe/Fit photography |
| Square (2px) controls, soft (16px) photos and sheets | Round a button or chip, or square off a photo |
| Tracked uppercase `caption` for button and chip labels | Put text on `surface-tile` — it's for photography only |
| Thin-stroke Phosphor icons, one family throughout | Mix icon families, or use color to distinguish icon states |
| A single `display`-type moment per screen | Stack multiple large serif headlines on one screen |
| Weight and fill-vs-outline for state (favorited, active tab, selected) | Color alone (or at all) to signal state |
| Flat surfaces, tonal separation only | Gradients, decorative texture, drop shadows on photography |
