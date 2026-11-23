# Screens and flows

## Entry points

- **Home**, when nothing is planned for today: a "Stylist" tile.
- **Planner day sheet**: a "Style this day" tile, which plans the chosen Fit for that day.
- **Item detail**: "Style this piece", which opens the Stylist with that item pinned.
- Later: a passive daily suggestion on Home (cached, one request per day).

## Stylist sheet (request)

- Occasion chips, style chips (presets), and a free-text field.
- Pinned items row: add from the closet picker; remove with a tap.
- Exclusions: "not this" chips (types) and per-item exclusion from the picker.
- Mode toggle: "Best" (default) or "Surprise me" (curate).
- Before first use: the photo-sharing disclosure, accepted once.
- Locked state below the unlock threshold, naming what's missing (top, bottom or shoes).

## Results

- Three collages rendered with the existing builder templates, each with its one-line reason.
- Per Fit: Save, Plan, Open in builder, Swap piece (pick a slot → next-best candidates), More like this, Dismiss.
- Shuffle re-samples. With no prompt it uses the quick-shuffle fast path and returns almost instantly.
- Coverage banner when partial or none: "Your closet is light on grunge. Here's the closest take."
- States: loading (several seconds; skeleton collages), over limit, pin ambiguous (choose among options), error with retry.

## Item detail

- A "Details" section shows the tagged attributes: subcategory, colors, pattern, fabric, formality, warmth, seasons, one-piece. Each one can be edited, and edits save to `item_attribute_overrides`.
- While tagging is pending, the section shows a quiet pending state.

## Style rules

Named "Stylist" in the serif. No chat UI, no sparkles or AI clichés. Redesign v2 palette and corners (`DESIGN.md`).
