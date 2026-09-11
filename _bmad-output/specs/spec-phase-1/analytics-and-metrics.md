# Analytics and metrics

## Phase 1 events

| Event | Properties |
|---|---|
| signed_up | method |
| onboarding_completed | items_added |
| item_added | source (camera, library), category, batch_size |
| item_removal_failed | reason |
| fit_created | item_count, categories, is_first |
| fit_edited | |
| fit_favorited | |
| fit_worn | source (home, detail) |
| fit_planned | days_ahead |
| fit_shared | |
| item_deleted, fit_deleted | |
| sync_failed | stage |
| account_deleted | |

## Activation funnel

signed_up → 5 items → first fit → second fit → worn or planned → returned the following week. This is the primary lens for CAP-10 and for the Phase 1 success signal.

## MVP north-star and cohort metrics

Carried forward from the full MVP requirements for use once Phase 1 has usage data (retrospective, Phase 2 planning):

- **North star:** weekly active users who create or use a Fit — distinguishes actual wardrobe/Fit usage from passive browsing.
- **Activation:** % of new users who add a first item, % who reach 5+ items, % who create a first Fit, time from signup to first Fit.
- **Engagement:** Fits created per active user, wardrobe items added per user, Fits marked worn, Fits planned.
- **Retention:** D1/D7/D30 retention, % returning after first Fit, % creating multiple Fits across different weeks.
- **Key question:** does Fittr remain useful after the user finishes setting up their wardrobe — the thing Phase 1 exists to answer.
