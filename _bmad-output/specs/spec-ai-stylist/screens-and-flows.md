# Screens and flows

## Entry points

- **Home**, when nothing is planned for today: a "Stylist" tile.
- **Planner day sheet**: a "Style this day" tile, which plans the chosen Fit for that day.
- **Item detail**: "Style this piece", which opens the Stylist with that item pinned.
- **Unworn items** (Story 4.5's cold spots): "Style it", which opens the Stylist with that item pinned.
- **Daily suggestion on Home** (in launch scope): one cached request per day, shown when nothing is planned for today, with an opt-in morning notification. Paid users only; free users see the Stylist tile instead.
- **Onboarding** (Story 6.8): once the closet meets the unlock threshold, the user gets one free prompted result, followed by the paywall.

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
- States: loading (several seconds; skeleton collages), paywall (a free user asking for a paid feature), over the paid daily cap, pin ambiguous (choose among options), error with retry.

## Free and paid

- Free: quick shuffle, unlimited; one prompted request in onboarding (the first result), then one prompted request per week.
- Paid: unlimited prompted requests (within the fair-use daily cap), pins, exclusions, styles, personalization, the visual check and the daily suggestion. Outside the Stylist, paid also unlocks the Insights dashboard (Story 4.7) and removes the share watermark (Story 12.4).
- Paywall triggers come from context, never mid-task interruptions: a paid control in the request sheet, the weekly allowance running out, "Style it" on an unworn item, and the closet cap.
- Paid controls in the request sheet stay visible to free users and open the paywall when tapped. They're never hidden.

## Paywall

- Two plans: annual (recommended, with the free trial) and monthly.
- Lists what the subscription unlocks, the trial length, and the price after the trial.
- Restore purchases, plus links to the terms and privacy policy, as App Store review requires.
- Opened from onboarding after the first free result, and from any paid control.

## Item detail

- A "Details" section shows the tagged attributes: subcategory, colors, pattern, fabric, formality, warmth, seasons, one-piece. Each one can be edited, and edits save to `item_attribute_overrides`.
- While tagging is pending, the section shows a quiet pending state.

## Style rules

Named "Stylist" in the serif. No chat UI, no sparkles or AI clichés. Redesign v2 palette and corners (`DESIGN.md`).
