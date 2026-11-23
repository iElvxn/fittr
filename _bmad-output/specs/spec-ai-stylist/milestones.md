# Milestones

Each milestone after v0 ships only if the eval shows it improves quality, or matches quality at lower cost. A layer that fails stays off, and that result is recorded.

| Milestone | Scope | Gate |
|---|---|---|
| **v0 Baseline** | `tag-item` (attributes only) + backfill + pg_cron sweep; attribute corrections on Item detail. `stylist` Edge Function: auth, rate limit, full closet as text attributes (photos as the ablation) → LLM structured output → validator + retry → log. ID pins. Quick-shuffle fast path. Results screen with Save/Plan/Open/Dismiss. Feedback rows. Eval harness + fixtures + random baseline. | Validity and pin adherence 100%; beats the random baseline; latency measured against the targets |
| **v1 Retrieval** | pgvector; embeddings added to `tag-item` and backfilled; intent parse with slot ideals; hard filters; scoring (style text, attributes, freshness); recall-oriented shortlist with versatility spots; best/curate modes; text pins; exclusions; never-rules; coverage by slot. | Score ≥ v0 at lower tokens per request; curate diversity passes |
| **v2 Personalization** | Taste vector, taste summary, Fit vibe labels and embeddings, past-Fit examples, swap and more-like-this feedback. | Hit-rate lift on the held-out set |
| **v3 Style library** | `styles` table, presets with reference images, vibe/anti-vibe, `item_style_scores`, free-text retrieval, on-the-fly cards, style coverage. | Style adherence beats the no-library ablation |
| **v4 Visual check** | Per-Fit vision review with swap/drop. | Outfit-score lift worth the added cost and latency |
| **Later** | Passive daily suggestion; "rediscover" toggle; calendar context. | Product call |

Tagging sits in v0 because it's useful on its own (closet search and filters) and makes a cheap, cacheable text-only baseline possible.

Sequencing: the work starts after Epic 6 and becomes a new epic (or one epic per milestone).
