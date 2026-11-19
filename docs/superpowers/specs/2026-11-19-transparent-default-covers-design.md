# Transparent covers for default-background Fits

Status: approved design (short), 2026-11-19

## Why

A Fit with no chosen background is saved with the current theme's
`surface-raised` color baked into its cover. Tiles show covers contained (never
cropped) in a 3:4 well filled with the theme's `surface-raised`. In the theme
the Fit was saved in, the two colors match and the cover looks full size. In the
other theme they differ, and the cover shows as a narrow rectangle inside the
tile.

"Default background" means "follow the theme", so the cover itself must carry
no background. Every screen already draws the theme color behind a
default-background cover. Item cutouts and thumbnails already work this way
(transparent WebP on themed surfaces).

## Goals

- New and re-saved default-background Fits look full size in light and dark
  mode, on every screen that shows a cover.
- Sharing a default-background Fit sends a solid image, filled with the
  `surface-raised` color of the theme the sharer is in when they share
  (what you see is what you send).

## Non-goals

- Existing Fits. Their covers keep their baked-in color until they're edited
  and saved again. They're only test data, since the app isn't public.
- Fits with a chosen background (Blush, Sage and so on). Their color stays
  baked into the cover, and they share exactly as now.
- Any change to tile layout, cropping or the 3:4 well.

## Anti-goals

- A shared image that is transparent. Messaging apps with dark backgrounds
  would hide dark clothing.
- Storing a second, opaque copy of every cover.

## Approaches

1. **Chosen: capture the card without its theme color.** During capture,
   `FitCanvas` already hides the selection outline and delete button. It also
   drops `bg-surface-raised` when `canvasBackgroundColor` is null. View-shot's
   PNG keeps the transparency, and `resizeLongEdge` to WebP keeps it, as item
   thumbnails already show.
2. Rejected: capture as now, then turn the theme color transparent. Clothing in
   that exact color would get holes.
3. Rejected: draw the cover from scratch in Skia. A rewrite of a capture that
   works.

For sharing:

1. **Chosen: fill at share time with Skia.** `shareFitCover` downloads the
   cover. When the Fit has no chosen background, it paints the given color
   behind the image on a Skia surface of the same size, encodes PNG, and shares
   that file. A solid cover (an old Fit) is unchanged by this.
2. Rejected: a hidden on-screen view captured with view-shot. Fragile and
   timing-dependent.
3. Rejected: expo-image-manipulator. It has no background fill.

## Decided

- Share fill color is the current theme's `surface-raised`: `#FFFDF8` light,
  `#24211E` dark (`lib/theme/colors.ts`), matching what the detail screen
  shows behind the cover.
- The detail screen passes the fill color to `shareFitCover`: `null` for a Fit
  with a chosen background (no compositing), the theme color otherwise.
- Tests first for each change (TDD).

## Left to the builder

- Exact shape of the Skia compositing helper and where it lives (next to
  `shareFit.ts` or in a small shared image helper).
- Checking every screen that shows a cover still draws the theme color behind
  a transparent one (the list from `grep cover_path`).

## Must be checked on a device

- View-shot's PNG of the card comes out transparent where the card has no
  color, including the rounded corners.
- The WebP thumbnail keeps that transparency.
- A shared default-background Fit arrives solid in Messages, in both themes.
