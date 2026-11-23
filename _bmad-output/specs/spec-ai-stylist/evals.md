# Evals

## Harness

A script (Deno or Node) runs the pipeline against fixtures and writes a score table: per metric, per milestone, and against the previous run. It is committed to the repo and run before any prompt, model, weight or layer change ships.

## Fixtures

- 6–10 fixture closets (40–120 items each) covering different styles, a thin closet, a minimum closet and a closet with no grunge pieces. Item photos come from team members' own closets or licensed sources.
- 30–50 requests per closet: occasions, preset styles, free-text styles, blends, pins, exclusions, weather extremes, curate mode.
- Held-out set for CAP-6: for consenting test users, hide 20% of real worn Fits.

## Metrics

| Metric | Type | Target |
|---|---|---|
| Validity rate (owned IDs, slots, no duplicates) | Rule | 100% after retry |
| Pin adherence | Rule | 100% |
| Exclusion adherence | Rule | 100% |
| Weather fit (warmth vs. temperature) | Rule | ≥ 95% |
| Outfit score (coherence, color harmony, occasion fit) | LLM judge with a fixed rubric (1–10) | Beats baseline; no regression > 0.3 |
| Style adherence (against the card's rules) | LLM judge | Beats the no-library ablation |
| Coverage honesty | Rule on no-coverage fixtures | 100% flagged |
| Curate diversity | Rule (set overlap across shuffles) | No identical sets in 5 shuffles |
| Personalization hit rate | Held-out real Fits ranked against random valid Fits | Lift over non-personalized |
| Basics recall | Rule: share of plain pieces in fixture gold outfits that survive the shortlist | ≥ 95% |
| Quick-shuffle outfit score | LLM judge | Reported against LLM curate mode |
| Cost / request, p50/p95 latency | Logged | Reported every run, against the latency targets |

## Baselines and ablations

- **Baseline:** a category-valid random outfit, the equivalent of a "Dress Me" shuffle.
- Ablations per milestone: text-only vs. images; stable vs. shuffled candidate order; shortlist size and versatility spots; Fit vibe label vs. collage embedding; ±retrieval; ±taste; ±style library; ±visual check; model swap per step.
- The judge is validated by spot-checking ~50 judgments by hand; agreement is reported.
