# Milestones

Each milestone after v0 ships only if the eval shows it improves quality, or matches quality at lower cost. A layer that fails stays off, and that result is recorded.

| Milestone | Scope | Gate |
|---|---|---|
| **v0 Baseline** | `tag-item` (attributes only) + backfill + pg_cron sweep; attribute corrections on Item detail. `stylist` Edge Function: auth, rate limit, full closet as text attributes (photos as the ablation) → LLM structured output → validator + retry → log. ID pins. Quick-shuffle fast path. Results screen with Save/Plan/Open/Dismiss. Feedback rows. Eval harness + fixtures + random baseline. | Validity and pin adherence 100%; beats the random baseline; latency measured against the targets |
| **v1 Retrieval** | pgvector; embeddings added to `tag-item` and backfilled; intent parse with slot ideals; hard filters; scoring (style text, attributes, freshness); recall-oriented shortlist with versatility spots; best/curate modes; text pins; exclusions; never-rules; coverage by slot. | Score ≥ v0 at lower tokens per request; curate diversity passes |
| **v2 Personalization** | Taste vector, taste summary, Fit vibe labels and embeddings, past-Fit examples, swap and more-like-this feedback. | Hit-rate lift on the held-out set |
| **v3 Style library** | `styles` table, presets with reference images, vibe/anti-vibe, `item_style_scores`, free-text retrieval, on-the-fly cards, style coverage. | Style adherence beats the no-library ablation |
| **v4 Visual check** | Per-Fit vision review with swap/drop. | Outfit-score lift worth the added cost and latency |
| **Daily suggestion** | A passive daily suggestion on Home (cached, one request per day) with an opt-in morning notification. | Product call; it's in launch scope |
| **Later** | "Rediscover" toggle; calendar context. | Product call |

Tagging sits in v0 because it's useful on its own (closet search and filters) and makes a cheap, cacheable text-only baseline possible.

## Launch scope and sequencing

Decided 2026-11-23: the whole Stylist is part of the public launch. Each milestone is its own epic (Epics 7–11 in `epics.md`), and a Subscriptions epic (Epic 12) ships with it. The order is:

1. Stories 6.6 and 6.7.
2. Epic 7 (v0), starting with Story 7.1, which closes the `fit_items` and `fit_wears` ownership gaps.
3. Epics 8–11 (v1–v4 and the daily suggestion), each gated by its eval.
4. Epic 12 (Subscriptions).
5. Stories 6.8 (onboarding ending in the first free result and the paywall), 6.9 (delete account, including Stylist data), 6.10, and finally 6.11 (pre-launch checks).

Gates still apply before launch. A layer that fails its gate ships turned off, and the result is recorded here.

**The v2 gate before launch:** new users have no history, so the pre-launch held-out set comes from the owner's and testers' accounts. v2 must also pass the cold-start fixtures (CAP-6). Its gate is re-run on real users' history after launch, and personalization is turned off if it doesn't hold up.
