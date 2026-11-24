# Data model additions

These extend the Phase 1 model (`../spec-phase-1/data-model.md`). RLS uses the `(select auth.uid())` pattern from `0003_wardrobe_items.sql`.

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `item_attributes` | Server-written item understanding | `item_id` PK → `wardrobe_items`, `user_id`, `attrs jsonb`, `embedding vector(N)`, `status text check (pending\|ready\|failed)`, `attempts int`, `model_version text`, `updated_at` | select own; no client insert/update/delete |
| `styles` | Style library | `id text` PK, `name`, `card jsonb`, `centroid vector(N)`, `vibe_vec vector(N)`, `anti_vibe_vec vector(N)`, `is_preset bool`, `created_from_request uuid null`, `version int` | select for all authenticated users; no client writes |
| `item_style_scores` | Per-item style affinity | `(item_id, style_id)` PK, `user_id`, `score real`, `style_version int` | select own; no client writes |
| `taste_profiles` | Personalization state | `user_id` PK, `explicit_prefs jsonb`, `never_rules jsonb`, `taste_vec vector(N) null`, `summary text null`, `updated_at` | select/update own for `explicit_prefs`, `never_rules`; server writes `taste_vec`, `summary` |
| `item_attribute_overrides` | User corrections to tags | `item_id` PK → `wardrobe_items`, `user_id`, `overrides jsonb`, `updated_at` | select/insert/update/delete own |
| `fit_profiles` | Fit-level vibe for retrieval | `fit_id` PK → `fits`, `user_id`, `vibe_label text`, `embedding vector(N)`, `model_version text`, `updated_at` | select own; no client writes |
| `stylist_requests` | Log, rate limit, eval data | `id`, `user_id`, `input jsonb`, `candidate_ids uuid[]`, `output jsonb`, `coverage text`, `models jsonb`, `input_tokens`, `output_tokens`, `cost_usd numeric`, `latency_ms int`, `status text`, `created_at` | select own; no client writes |
| `stylist_feedback` | Signals | `id`, `request_id` → `stylist_requests`, `user_id`, `fit_index int`, `action text check (saved\|planned\|opened\|swapped\|more_like\|dismissed\|liked)`, `detail jsonb` (e.g. swapped slot and item), `created_at` | insert/select own |
| `entitlements` | Subscription state, written from RevenueCat webhooks | `user_id` PK, `is_active bool`, `product_id text`, `period text check (monthly\|annual)`, `in_trial bool`, `expires_at timestamptz`, `updated_at` | select own; no client writes |

## Functions and indexes

- A trigger on `wardrobe_items` insert enforces the closet size: about 100 items without an active entitlement, plus 5 bonus slots per completed referral (Story 12.5), and a hard ceiling of 500 for everyone. The exact free cap is set in Epic 12.
- `create extension vector;`, plus HNSW indexes (cosine) on `item_attributes.embedding` and `fit_profiles.embedding`.
- `match_items(query vector, p_category text, k int)`: `security invoker`, so RLS still applies.
- Index `stylist_requests (user_id, created_at desc)` for the rate limit, the free weekly allowance and recent-suggestion exclusion.
- Index `item_style_scores (user_id, style_id, score desc)`.

## Notes

- `N` depends on the embedding model chosen (open question in SPEC).
- `saveFit` stays the only path for creating Fits. A saved suggestion goes through it, then a `stylist_feedback` row is written.
- New RLS tests go in `supabase/tests/rls.test.ts`: cross-user reads denied on every new table, and client writes denied on server-owned tables.
