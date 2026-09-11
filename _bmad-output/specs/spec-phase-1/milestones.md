# Milestones

| Milestone | Deliverable | Done when |
|---|---|---|
| M0 Foundation | Expo project, Router, NativeWind, Drizzle, CI, Supabase project, schema migrations, RLS, auth screens, PostHog and Sentry wired in | A user can sign up, sign in, sign out on a dev build, and a test event reaches PostHog |
| M1 Wardrobe | Add with background removal, library multi-select and rapid camera capture, shared batch queue, grid, detail, edit, delete, all local | Ten items added from photos in under three minutes, by either capture method |
| M2 Fits | Templates, freeform drag/pinch/rotate canvas, view-shot export, save, My Fits, favorite, wear, share image | A Fit created and freely rearranged from wardrobe items, then shared as an image |
| M3 Planner | Week view, assign, replace, remove, Home today card | A week planned and a Fit marked worn from Home |
| M4 Cloud persistence | Direct Postgres reads/writes and Storage upload/download wired in for all wardrobe, Fit, and planner actions | Delete and reinstall the app; everything comes back from Supabase |
| M5 Launch readiness | Onboarding, analytics, Sentry, delete account, error and empty states, Maestro flows, App Store assets | All launch criteria in SPEC.md pass |
| M6 Cohort | TestFlight to a small cohort, weekly funnel review | Two weeks of data on the funnel |

Phase 1 is online-only against Supabase throughout; there is no local-first product stage to build before it.
