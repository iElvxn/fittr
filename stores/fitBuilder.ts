import { create } from 'zustand';
import * as Crypto from 'expo-crypto';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { getTemplateSlots, type CanvasSlot, type TemplateId } from '@/lib/fitBuilder/templates';

export type PlacedItem = CanvasSlot & {
  id: string;
  wardrobeItemId: string;
  category: WardrobeItemCategory;
};

type FitBuilderState = {
  /** `null` means "blank canvas" -- no slot map to seed placements from. */
  templateId: TemplateId | null;
  items: PlacedItem[];
  selectedId: string | null;

  selectTemplate: (templateId: TemplateId | null) => void;
  addItem: (wardrobeItemId: string, category: WardrobeItemCategory) => void;
  updateItemTransform: (id: string, transform: Partial<Pick<CanvasSlot, 'x' | 'y' | 'scale' | 'rotation'>>) => void;
  selectItem: (id: string | null) => void;
  bringToFront: (id: string) => void;
  reset: () => void;
};

/**
 * Base step size and rotation for the sunflower-seed (phyllotaxis) pattern
 * used to place repeats in an already-occupied category. Radius grows with
 * sqrt(count) and angle advances by the golden angle each time -- this keeps
 * every repeat visibly near the category's anchor point (never drifting
 * toward a canvas corner) while guaranteeing no two repeats ever land on the
 * exact same spot, however many items pile into one category.
 */
const SAME_CATEGORY_RADIUS_STEP = 0.05;
const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));
const CENTERED_SLOT: CanvasSlot = { x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 0 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function maxZIndex(items: PlacedItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.zIndex), 0);
}

/**
 * In-progress Fit canvas state -- everything here is discarded on `reset` or
 * on backing out of the builder (Story 3.1 has no preview/save/persistence;
 * that's Story 3.2). Positions are 0-1 canvas-relative percentages, not
 * pixels, per the spec's device-independence boundary.
 */
export const useFitBuilderStore = create<FitBuilderState>((set, get) => ({
  templateId: null,
  items: [],
  selectedId: null,

  selectTemplate: (templateId) => set({ templateId, items: [], selectedId: null }),

  addItem: (wardrobeItemId, category) => {
    const { templateId, items } = get();
    const sameCategoryCount = items.filter((item) => item.category === category).length;
    const slots = templateId ? getTemplateSlots(templateId, category) : [];
    // The Nth item in a category takes the Nth defined slot verbatim, if the
    // template defined one (a template can seed more than one slot for the
    // same category, e.g. two Accessories slots). Once slots run out, every
    // further repeat spirals out from the last defined slot (or canvas
    // center, if the category has none) rather than from wherever the
    // previous repeat happened to land. The very first item in a category is
    // always exact -- there's nothing yet to avoid overlapping.
    const exactSlot = slots[sameCategoryCount];
    const anchor = exactSlot ?? slots[slots.length - 1] ?? CENTERED_SLOT;
    const topZIndex = maxZIndex(items) + 1;

    let x = anchor.x;
    let y = anchor.y;
    if (sameCategoryCount > 0 && !exactSlot) {
      const excess = sameCategoryCount - slots.length + 1;
      const angle = excess * GOLDEN_ANGLE_RADIANS;
      const radius = SAME_CATEGORY_RADIUS_STEP * Math.sqrt(excess);
      x = clamp01(anchor.x + radius * Math.cos(angle));
      y = clamp01(anchor.y + radius * Math.sin(angle));
    }

    const placement: PlacedItem = {
      id: Crypto.randomUUID(),
      wardrobeItemId,
      category,
      x,
      y,
      scale: anchor.scale,
      rotation: anchor.rotation,
      // A slotted item keeps that slot's own z-index verbatim (frozen matrix
      // row); every other case -- blank canvas, an unseeded category, or a
      // spiraled repeat -- stacks on top.
      zIndex: exactSlot ? exactSlot.zIndex : topZIndex,
    };

    set({ items: [...items, placement] });
  },

  updateItemTransform: (id, transform) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...transform } : item)),
    })),

  selectItem: (id) => set({ selectedId: id }),

  bringToFront: (id) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, zIndex: maxZIndex(state.items) + 1 } : item)),
    })),

  reset: () => set({ templateId: null, items: [], selectedId: null }),
}));
