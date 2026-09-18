-- Story 3.3 follow-up: persist the canvas's chosen background color so
-- editing a Fit can restore it. Previously it only existed baked into the
-- saved cover.png raster and in stores/fitBuilder.ts's in-memory
-- `canvasBackgroundColor` field -- re-opening a Fit for editing always
-- reverted to the default background regardless of what it was built with,
-- since there was nowhere in the schema to read it back from.
--
-- The CHECK constraint hardcodes lib/fitBuilder/backgroundColors.ts's
-- current curated swatch set -- a deliberate, closed list per that file's
-- own "a fixed, hand-picked set rather than an open color picker" design
-- intent. Adding a swatch there later needs a migration here too.

alter table public.fits
  add column canvas_background_color text
    check (
      canvas_background_color is null
      or canvas_background_color in (
        '#F6DADA', '#F8DFC8', '#F5EBC8', '#DCE8DC',
        '#D9E6F2', '#E6DCF0', '#F0E4D3', '#DDD5CC'
      )
    );

comment on column public.fits.canvas_background_color is
  'One of lib/fitBuilder/backgroundColors.ts''s curated pastel swatches, or '
  'null for the theme default -- mirrors stores/fitBuilder.ts''s '
  'canvasBackgroundColor field exactly.';
