# Personalization

| Layer | Source | Used where |
|---|---|---|
| Explicit prefs | Stylist onboarding chips (styles, fit preferences), `never_rules` | Hard filters; cold-start style bias |
| Taste vector | Weighted mean of item embeddings: worn ×3, saved ×2, liked ×1, minus dismissed ×1; recency-decayed | `taste_match` in scoring |
| Taste summary | Nightly pg_cron → LLM summary of recent Fits, wears and feedback (e.g. "muted earth tones, relaxed fits, rarely patterns") | Generation prompt |
| Past-Fit examples | 3–5 most similar worn/saved Fits, by `fit_profiles.embedding` | Generation prompt |
| Freshness | Days since last worn (from `fit_wears`); optional "rediscover" toggle raises `w_fresh` | Scoring |

## Signal strength

worn > saved/planned > swap (points to one bad pairing in one slot) > liked > dismissed (weak negative).

## Rules

- The taste vector updates on each worn/saved/liked/dismissed event; it's cheap to recompute and needs no training.
- With no history, `w_taste = 0` and the prompt has no examples.
- A Fit's vector is not the mean of its items' vectors, because style comes from the combination. When a Fit is saved or worn, the LLM writes a short vibe label ("undone 90s layers, dark palette") from its item images, and the label's text embedding becomes the Fit's vector. Embedding the collage image is the ablation.
- Collaborative filtering across users is not used. Items are unique per user, so the image embedding space is the only shared space.
- Swap feedback stores `{slot, from_item, to_item}` and builds up per-user "goes with" / "doesn't go with" pairs for later scoring.
