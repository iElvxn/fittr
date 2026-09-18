import { create } from 'zustand';
import * as Crypto from 'expo-crypto';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { FIT_TEMPLATES, type CanvasSlot, type TemplateId, type TemplateSlot } from '@/lib/fitBuilder/templates';

export type PlacedItem = CanvasSlot & {
  id: string;
  wardrobeItemId: string;
  category: WardrobeItemCategory;
  /**
   * Index into `FIT_TEMPLATES[templateId]` this item was placed from, or
   * `null` for a spiraled repeat / blank-canvas placement with no template
   * slot behind it. This is the *only* thing that decides which ghost slot
   * is "filled" -- not a per-category count -- so tapping the second of two
   * same-category ghosts always fills that exact one, never the first.
   */
  templateSlotIndex: number | null;
};

type FitBuilderState = {
  /** `null` means "blank canvas" -- no slot map to seed placements from. */
  templateId: TemplateId | null;
  items: PlacedItem[];
  selectedId: string | null;
  /** `null` means the theme's own default canvas surface -- no override applied. */
  canvasBackgroundColor: string | null;

  selectTemplate: (templateId: TemplateId | null) => void;
  /**
   * `templateSlotIndex`, when given, commits the item to that exact template
   * slot regardless of how many same-category items already exist -- this is
   * what a ghost-slot tap passes. Omitted for a general "Add item" pick with
   * no specific slot in mind, which claims the first same-category template
   * slot no explicit tap has already claimed, then spirals outward once
   * those run out.
   */
  addItem: (wardrobeItemId: string, category: WardrobeItemCategory, templateSlotIndex?: number) => void;
  updateItemTransform: (id: string, transform: Partial<Pick<CanvasSlot, 'x' | 'y' | 'scale' | 'rotation'>>) => void;
  selectItem: (id: string | null) => void;
  bringToFront: (id: string) => void;
  removeItem: (id: string) => void;
  setCanvasBackgroundColor: (hex: string | null) => void;
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
  canvasBackgroundColor: null,

  selectTemplate: (templateId) => set({ templateId, items: [], selectedId: null }),

  addItem: (wardrobeItemId, category, templateSlotIndex) => {
    const { templateId, items } = get();
    const templateSlots = templateId ? FIT_TEMPLATES[templateId] : [];

    function place(slot: CanvasSlot, slotIndex: number | null): void {
      const placement: PlacedItem = {
        id: Crypto.randomUUID(),
        wardrobeItemId,
        category,
        templateSlotIndex: slotIndex,
        x: slot.x,
        y: slot.y,
        scale: slot.scale,
        rotation: slot.rotation,
        zIndex: slot.zIndex,
      };
      set({ items: [...get().items, placement] });
    }

    // A specific ghost slot was tapped -- commit to it exactly, no counting.
    // Whichever placeholder was clicked is the one that gets filled.
    if (templateSlotIndex !== undefined) {
      place(templateSlots[templateSlotIndex], templateSlotIndex);
      return;
    }

    // General add (e.g. the unfiltered "Add item" bar, no slot in mind):
    // claim the first same-category template slot no earlier explicit tap
    // has already claimed, in template order -- mirrors the old "Nth item
    // takes the Nth slot" rule while never re-claiming an out-of-order pick.
    const sameCategorySlots: { slot: TemplateSlot; index: number }[] = templateSlots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.category === category);
    const claimedIndexes = new Set(
      items.map((item) => item.templateSlotIndex).filter((index): index is number => index !== null),
    );
    const openSlot = sameCategorySlots.find(({ index }) => !claimedIndexes.has(index));

    if (openSlot) {
      place(openSlot.slot, openSlot.index);
      return;
    }

    // Every template-defined slot for this category is already taken (or
    // this category/template has none) -- spiral outward from the last
    // defined slot, or canvas center if there isn't one, same as before.
    const anchor = sameCategorySlots[sameCategorySlots.length - 1]?.slot ?? CENTERED_SLOT;
    const sameCategoryCount = items.filter((item) => item.category === category).length;
    const topZIndex = maxZIndex(items) + 1;

    let x = anchor.x;
    let y = anchor.y;
    if (sameCategoryCount > 0) {
      const excess = sameCategoryCount - sameCategorySlots.length + 1;
      const angle = excess * GOLDEN_ANGLE_RADIANS;
      const radius = SAME_CATEGORY_RADIUS_STEP * Math.sqrt(excess);
      x = clamp01(anchor.x + radius * Math.cos(angle));
      y = clamp01(anchor.y + radius * Math.sin(angle));
    }

    place({ x, y, scale: anchor.scale, rotation: anchor.rotation, zIndex: topZIndex }, null);
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

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  setCanvasBackgroundColor: (hex) => set({ canvasBackgroundColor: hex }),

  reset: () => set({ templateId: null, items: [], selectedId: null, canvasBackgroundColor: null }),
}));
