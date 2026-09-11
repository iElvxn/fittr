# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.
>
> **Superseded by `bmad-ux`'s spines.** `_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md` and `EXPERIENCE.md` are now the canonical design contract and win on any conflict with this file. This file is kept in sync on the color story (no accent color) but uses its own token names; treat `DESIGN.md` as the source of truth for actual build work.

---

**Project:** Fittr
**Generated:** 2026-09-09 21:10:49 (color story updated 2026-09-10 — accent color dropped)
**Category:** Pure monochrome — classic, minimalist, sophisticated (fashionista aesthetic), no accent color
**Design Dials:** Variance 3/10 (Centered / Minimal) | Motion 3/10 (Subtle)
**Platform:** Native iOS app (Expo/React Native + NativeWind), not web — component specs, motion, and checklist below are adapted for that platform; the auto-generated CSS/GSAP/landing-page output has been replaced.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1C1917` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#44403C` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Background | `#FAFAF9` | `--color-background` |
| Foreground | `#0C0A09` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#0C0A09` | `--color-card-foreground` |
| Muted | `#E8ECF0` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#D6D3D1` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#1C1917` | `--color-ring` |

**Color Notes:** Pure monochrome, no accent color — Primary (`#1C1917`) doubles as both text ink and CTA fill. Clothing photography is the only color anywhere in the app.

### Typography

- **Heading Font:** Cormorant
- **Body Font:** Montserrat
- **Mood:** luxury, high-end, fashion, elegant, refined, premium
- **Google Fonts:** [Cormorant + Montserrat](https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs (NativeWind / React Native)

No hover states, no `cursor`, no CSS transitions — use `Pressable` press states (`pressed` prop) and Reanimated for any animated feedback.

### Buttons

```jsx
// Primary — className via NativeWind (tailwind.config maps the tokens above)
<Pressable className="bg-primary px-6 py-3 rounded-lg active:opacity-90">
  <Text className="text-white font-semibold">Save</Text>
</Pressable>

// Secondary — outlined, ink-colored
<Pressable className="border-2 border-primary px-6 py-3 rounded-lg active:opacity-90">
  <Text className="text-primary font-semibold">Cancel</Text>
</Pressable>
```
Minimum hit area 44×44pt — use `hitSlop` when the visual button is smaller than that.

### Cards

```jsx
<View className="bg-card rounded-xl p-6 shadow-sm">
  {/* content */}
</View>
```
No hover lift (there's no hover on touch) — use `active:` press opacity only if the whole card is tappable.

### Inputs

```jsx
<TextInput
  className="px-4 py-3 border border-border rounded-lg text-base focus:border-primary"
  placeholderTextColor="#78716C"
/>
```
16px minimum font size (matches iOS's own guidance to avoid unwanted zoom-equivalent scaling and keeps Dynamic Type room to grow).

### Modals / Sheets

```jsx
<View className="absolute inset-0 bg-black/50" />
<View className="bg-white rounded-t-2xl p-8 shadow-xl">
  {/* sheet content, animate in via Reanimated slide-up */}
</View>
```
Sheets animate from their trigger (slide up from the bottom), not a generic fade — and always offer a swipe-down-to-dismiss plus an explicit close affordance.

---

## Style Guidelines

**Style:** Minimalism, applied to a classic/luxury fashion mood — the "essential, high-contrast, grid-based" discipline of Swiss minimalism, aimed at a fashion/editorial product rather than the dashboards this style entry is normally used for.

**Keywords:** Clean, simple, spacious, high contrast, geometric grid, essential — plus editorial restraint: no accent color at all, one display moment per screen, thin-stroke icons only. State (favorited, active, selected) is shown through weight and fill-vs-outline, never color.

**Icons:** Phosphor, thin stroke weight, one weight throughout the app.

**Key Effects:** Subtle press feedback (spring, not linear), no gradients, shadow only as a light card lift (`--shadow-sm`), clear type hierarchy via the Cormorant/Montserrat pairing above rather than color.

### App Structure

Fittr is a 5-tab native app, not a scrolling marketing page — see `_bmad-output/specs/spec-phase-1/screens-and-flows.md` for the actual screen inventory (Home, Wardrobe, Fit builder, My Fits, Planner, Profile). Apply this style/color/type system to those screens directly; there is no separate "landing page" in this product.

---

## Motion (React Native Reanimated, Subtle tier)

Matches the Motion 3/10 dial: micro-interactions only, nothing choreographed.

- **Press feedback:** subtle scale 0.95–1 on press, spring-based, restores on release — not a linear tween.
- **Screen transitions:** Expo Router's default stack/tab transitions are enough; don't add custom page transitions at this motion tier.
- **List/grid entrance:** skip stagger animations at this tier — render content directly, use a skeleton while loading instead of animating items in.
- **Always:** respect `prefers-reduced-motion` equivalent (`AccessibilityInfo.isReduceMotionEnabled`) — skip non-essential motion and show the final state immediately when it's on.
- **Never:** animate `width`/`height`/layout properties — use `transform`/`opacity` only, so animations stay off the JS thread via Reanimated's worklets.

---

## Anti-Patterns (Do NOT Use)

- ❌ Vibrant & block-based color, or any accent color at all — this is pure monochrome, not a colorful UI
- ❌ Playful colors, filled/bold icon sets, or mixed icon weights — thin-stroke only, one family (Phosphor)
- ❌ Gradients, drop shadows beyond a subtle card lift, or decorative texture
- ❌ Layout-shifting press feedback (scale transforms that move surrounding content)
- ❌ Low contrast text — maintain 4.5:1 minimum in both light and dark mode
- ❌ Instant state changes with no feedback — use spring-based press feedback (see Motion)
- ❌ Animating `width`/`height` — `transform`/`opacity` only

---

## Pre-Delivery Checklist (Native App)

Before delivering any screen, verify:

- [ ] No emojis used as icons — SVG/vector icons only (Phosphor, thin stroke)
- [ ] All icons from one consistent family and stroke weight
- [ ] Touch targets ≥44×44pt (iOS), with `hitSlop` when the visual element is smaller
- [ ] Text contrast ≥4.5:1 in both light and dark mode (test both — don't assume light mode values carry over)
- [ ] Safe areas respected for the tab bar, headers, and any bottom sheets/CTAs
- [ ] `prefers-reduced-motion` equivalent respected (`AccessibilityInfo.isReduceMotionEnabled`)
- [ ] Dynamic Type: verify layout doesn't break at the largest text size
- [ ] Loading, empty, and error states present on every list screen (Wardrobe, My Fits, Planner)
- [ ] Gesture regions (Fit-builder canvas drag/pinch/rotate) don't conflict with the iOS edge-swipe-back gesture
- [ ] Tested on a small phone size and in landscape where the screen allows rotation
