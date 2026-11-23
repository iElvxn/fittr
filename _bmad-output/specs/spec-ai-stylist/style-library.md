# Style library

## Style card format

```json
{
  "id": "grunge",
  "name": "Grunge",
  "description": "90s Seattle. Worn-in, layered, deliberately undone.",
  "key_pieces": ["flannel shirt", "band tee", "ripped or loose denim", "combat boots", "oversized knit", "slip dress"],
  "slot_ideals": {
    "top": ["open flannel", "band tee", "worn-in plain tee", "thermal", "oversized knit"],
    "bottom": ["loose or ripped denim", "black jeans"],
    "one_piece": ["slip dress"],
    "shoes": ["combat boots", "worn canvas sneakers"],
    "outerwear": ["leather jacket", "oversized cardigan"]
  },
  "colors": ["black", "charcoal", "olive", "burgundy", "faded denim"],
  "fabrics": ["flannel", "denim", "leather", "worn cotton"],
  "patterns": ["plaid", "graphic"],
  "silhouette": "oversized top, loose or straight bottom, heavy footwear",
  "formality": [1, 2],
  "rules": ["layer an open flannel over a tee", "heavy boots over sneakers where possible", "avoid anything polished or tailored"],
  "vibe": "worn-in, layered, dark, undone 90s",
  "anti_vibe": "polished, tailored, preppy, crisp, bright",
  "reference_images": ["grunge_01.jpg"]
}
```

## Starter presets (15–25)

Grunge, retro/70s, dark academia, light academia, old money, streetwear, minimalist, Y2K, gorpcore, preppy, cottagecore, techwear, smart casual, athleisure, business casual. Cards are drafted by an LLM and edited by hand. Reference images: ~20 per style, stored server-side with their licensing recorded.

## Vectors per style

- `centroid`: mean image embedding of the reference images.
- `vibe_vec` / `anti_vibe_vec`: text embeddings of `vibe` / `anti_vibe`.

## Item style score (computed when an item is tagged)

```
style_score = 0.5 × image_term + 0.5 × attribute_match
image_term  = cos(item, centroid) + (cos(item, vibe_vec) − cos(item, anti_vibe_vec))   (normalized)
attribute_match = share of: color in palette, fabric listed, pattern listed, formality in range, matches an ideal for its slot
```

This score says how well an item fits the style by itself. It feeds shortlisting only, never the final judgment, and the versatility spots (`pipeline.md`) keep plain pieces in play.

Adding or editing a card bumps `version` and triggers a backfill of `item_style_scores`.

## Free-text styles

1. Embed the text and retrieve the 1–2 closest cards (cosine against `vibe_vec`). Above the threshold, use or blend them; a modifier such as "for summer" adjusts the filters.
2. Below the threshold, the LLM drafts a new card in this format; it's stored with `is_preset = false` and scored against this closet on demand, then cached for reuse.

## Coverage

A style is covered when every open slot has at least `k` items (start at `k = 1`) with `style_score` above the threshold (tuned by eval). Partial and none outcomes follow CAP-8.
