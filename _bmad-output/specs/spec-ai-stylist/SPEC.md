---
id: SPEC-ai-stylist
companions: [pipeline.md, data-model.md, style-library.md, personalization.md, evals.md, screens-and-flows.md, milestones.md, ../spec-phase-1/stack.md, ../spec-phase-1/data-model.md, ../../planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md]
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Fittr AI Stylist

## Why

A vision to realize and an opportunity to capture. Fittr users have catalogued real closets but still decide by hand what to wear. Competing apps either learn from weak signals (Cloey's swipes) or produce outfits that feel random (Whering's "Dress Me"). Fittr already records stronger signals: Fits built, worn, planned and, once the Stylist ships, single-piece swaps. The Stylist turns those signals into outfits built only from the user's own clothes. They should feel personal, follow any style the user names, and honor any piece the user insists on. The goal is quality that is measured, not claimed.

## Capabilities

- **CAP-1 Occasion request**
  - **intent:** User describes an occasion or need in free text or chips and gets 3 Fits built only from their own items, each with a one-line reason.
  - **success:** On the eval set, every returned Fit is valid (owned IDs, required slots covered per the slot rules in `pipeline.md`, weather-appropriate) and scores above the random baseline (see `evals.md`).

- **CAP-2 Curate mode**
  - **intent:** User asks for surprise or varied looks from a prompt; Shuffle produces a fresh set. A quick shuffle with no prompt uses a fast path with no LLM call.
  - **success:** Across 5 consecutive shuffles on a 60-item fixture closet, no two returned sets are identical, and within one set no item appears in more than one Fit unless pinned. The quick-shuffle fast path returns in under 1 s at p95.

- **CAP-3 Style requests**
  - **intent:** User picks a preset style chip or types a free-text style (including blends and styles with no preset), and the results follow that style.
  - **success:** Style-adherence judge score per preset style beats the no-style-library ablation; an unknown style returns results and creates a reusable cached style card.

- **CAP-4 Pins**
  - **intent:** User can require specific items, by tapping them or describing them in text, and every returned Fit includes them.
  - **success:** 100% pin adherence on the eval set; an ambiguous text pin asks the user to choose rather than guessing.

- **CAP-5 Exclusions**
  - **intent:** User can exclude items or types for one request and set persistent "never suggest" rules.
  - **success:** Excluded items appear in 0 returned Fits on the eval set.

- **CAP-6 Personalization**
  - **intent:** Suggestions reflect the user's taste, learned from worn, saved, liked, swapped and dismissed Fits plus explicit preferences; a new user still gets good results.
  - **success:** On held-out real outfits, the personalized pipeline ranks them above the non-personalized pipeline does (hit-rate lift; see `evals.md`). Cold-start fixtures still pass CAP-1.

- **CAP-7 Act on results**
  - **intent:** User can save a suggestion as a Fit, plan it for a day, open it in the builder, swap one piece, ask for more like it, or dismiss it.
  - **success:** Each action works end to end on a dev build and writes a feedback row linked to the originating request.

- **CAP-8 Honest coverage**
  - **intent:** When the closet can't satisfy a style, pin or occasion, the user is told and offered the closest option.
  - **success:** On fixture closets with no pieces for a style, the response is flagged partial or none in 100% of cases, never presented as a full match.

- **CAP-9 Item understanding**
  - **intent:** Every item gets rich attributes, an image embedding and per-style scores automatically after it's added; existing items are backfilled. Users can correct any attribute, and corrections survive re-tagging.
  - **success:** Within 1 minute of adding an item, its `item_attributes` row is ready; the backfill brings an existing closet to 100% ready; failed rows are retried automatically; re-tagging never overwrites a user correction.

- **CAP-10 Visual check**
  - **intent:** Final outfits are reviewed by a vision model looking at the item images; weak pieces are swapped or the outfit is dropped.
  - **success:** Enabling the check improves the eval's visual-harmony judge score at an acceptable cost per request, or it stays off (see `milestones.md`).

- **CAP-11 Evals and logging**
  - **intent:** An offline harness scores the pipeline on fixture closets, and every live request is logged with its inputs, candidates, output, tokens, cost and latency.
  - **success:** One command produces a score table comparing the current pipeline with the baseline and previous runs; every live request has a `stylist_requests` row.

- **CAP-12 Access and usage limits**
  - **intent:** The Stylist is a paid feature, with a taste for free users. Free users get unlimited quick shuffles, one free prompted request during onboarding (the first result), and then one free prompted request per week. Everything else needs an active subscription: prompted requests, pins, styles, personalization and the visual check. Paid users have a fair-use daily cap. Access and caps are enforced on the server, from the `entitlements` table, never from the client.
  - **success:** A free user's prompted request beyond the onboarding result and the weekly allowance returns a defined paywall response, and the client opens the paywall. A paid user's request after the daily cap returns a defined over-limit response, and the client shows it. A forged client claim of a subscription is rejected. Quick shuffle works for free users.

## Constraints

- **Only the user's own items.** The model picks item IDs from a candidate list the server supplies; output IDs are validated against those candidates and against ownership. Nothing is ever invented.
- **Pins are enforced in code.** They are locked in before generation and the validator rejects any Fit missing one. Required adherence is 100%.
- **Model and embedding API keys live only in Supabase Edge Function secrets.** This is allowed under NFR9's secret/trust-boundary exception and must be recorded as such.
- **Edge Functions read data with the caller's JWT**, so RLS limits every read to that user. The service role is used only to write server-owned tables.
- **Server-owned tables** (`item_attributes`, `item_style_scores`, `stylist_requests`) get a select-own RLS policy and no client write policies.
- **NFR7 (no Redis or queues):** background tagging uses a database webhook plus a status column swept by pg_cron. No pgmq.
- **Randomness lives in code** (weighted sampling), not in the LLM. Whether candidate order is shuffled per call (against position bias) or kept stable (for prompt caching) is decided by eval.
- **Retrieval favors recall; style is judged at the outfit level.** Style comes from how pieces combine, so the shortlist must keep plain, versatile pieces that score low on a style by themselves. Style adherence is judged on whole outfits, by the generator and the eval judge.
- **Latency targets (proposed; confirmed by v0 measurements):** quick shuffle p95 < 1 s; prompted request p95 < 8 s.
- **Unlock threshold:** the Stylist unlocks once the closet has at least one top, one bottom and one pair of shoes.
- **Photo disclosure and consent:** item photos are sent to a third-party model API. Before first use, Stylist onboarding names the provider, says what is sent, and asks for explicit consent, as App Store review requires for personal data shared with third-party AI.
- **UI:** named "Stylist" in the serif; no chat interface, no sparkles or AI clichés; follows the redesign v2 direction (`DESIGN.md`).
- **Baseline first:** every layer after v0 ships only if the eval shows it improves quality, or matches quality at lower cost (`milestones.md`).
- **Part of launch (decided 2026-11-23):** all milestones v0–v4 and the daily suggestion are built and evaluated before the public launch, inside a subscription launched the same day (see `milestones.md`). A layer that fails its gate ships turned off; it is not forced on.

## Non-goals

- Shopping, buying suggestions or affiliate links.
- Virtual try-on, avatars, or generated images of clothing.
- A conversational chat interface.
- Cross-user collaborative filtering: each user's items are unique, so it doesn't apply.
- Calendar integration and the "rediscover" toggle (possible after launch).
- Training or fine-tuning custom models.

## Success signal

On the fixture eval, the shipped pipeline beats the category-valid random baseline on outfit score, with 100% validity, pin adherence and exclusion adherence. In a real-device demo, "grunge for a concert, with my flannel" returns three valid Fits, each containing the flannel and each with a reason, and one of them saves as a Fit in a single tap.

## Assumptions

- Weather is new to the app; the client fetches it and passes it to the function, which keeps location off the server.
- Transparent cutouts may need flattening onto a neutral background before they're sent to the model; to be verified in v0.
- Dresses and jumpsuits are stored under the existing `top` category today; tagging marks them `one_piece`.
- Embeddings come from a FashionCLIP-class model on a hosted inference endpoint, since Claude has no embeddings API.

## Open Questions

- Which hosted embedding provider and model: FashionCLIP on Hugging Face or Replicate, or a commercial multimodal embedding API?
- Which Claude model for each step (tagging, generation, visual check)? To be decided by eval cost and quality.
- What's the paid fair-use daily cap for prompted requests? (Free vs. paid is decided: see CAP-12 and Epic 12 in `epics.md`.)
- Should `one_piece` become a real `wardrobe_items` category (this affects the builder templates), or stay a tagged attribute?
- Which weather source to use, and is asking for location permission acceptable?
- How long are `stylist_requests` and feedback rows kept, given they're used as eval data?
