let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

import { useFitBuilderStore, type PlacedItem } from '@/stores/fitBuilder';
import { FIT_TEMPLATES } from '@/lib/fitBuilder/templates';

function findSlot(templateId: keyof typeof FIT_TEMPLATES, category: string, index = 0) {
  return FIT_TEMPLATES[templateId].filter((slot) => slot.category === category)[index];
}

beforeEach(() => {
  mockUuidCounter = 0;
  useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null, canvasBackgroundColor: null });
});

describe('selectTemplate', () => {
  it('caches the template id and starts with an empty canvas', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    const state = useFitBuilderStore.getState();
    expect(state.templateId).toBe('shorts-and-top');
    expect(state.items).toEqual([]);
  });

  it('caches no slot map for blank canvas', () => {
    useFitBuilderStore.getState().selectTemplate(null);
    expect(useFitBuilderStore.getState().templateId).toBeNull();
  });
});

describe('addItem', () => {
  it("places a slotted category's first item at the template's exact position, scale, rotation, and z-index", () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'shoes');
    const [placed] = useFitBuilderStore.getState().items;
    const { x, y, scale, rotation, zIndex } = findSlot('shorts-and-top', 'shoes');
    expect(placed).toMatchObject({ x, y, scale, rotation, zIndex });
    expect(placed.wardrobeItemId).toBe('wardrobe-item-1');
  });

  it('centers an item on blank canvas', () => {
    useFitBuilderStore.getState().selectTemplate(null);
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    expect(placed.x).toBe(0.5);
    expect(placed.y).toBe(0.5);
  });

  it("centers an item in a category the chosen template doesn't seed", () => {
    useFitBuilderStore.getState().selectTemplate('layered-outerwear');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'shoes');
    const [placed] = useFitBuilderStore.getState().items;
    expect(placed.x).toBe(0.5);
    expect(placed.y).toBe(0.5);
  });

  it('places the second item of a category seeded with two slots at its own exact position (not a spiral offset)', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'accessory');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'accessory');
    const [first, second] = useFitBuilderStore.getState().items;
    const firstSlot = findSlot('shorts-and-top', 'accessory', 0);
    const secondSlot = findSlot('shorts-and-top', 'accessory', 1);

    expect(first).toMatchObject({ x: firstSlot.x, y: firstSlot.y });
    expect(second).toMatchObject({ x: secondSlot.x, y: secondSlot.y });
  });

  it('places an item at the exact slot index passed in, ignoring how many same-category items already exist', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    const secondAccessorySlot = findSlot('shorts-and-top', 'accessory', 1);
    const allSlots = [...FIT_TEMPLATES['shorts-and-top']];
    const secondAccessoryIndex = allSlots.indexOf(secondAccessorySlot);

    // Tapping the *second* accessory ghost first (nothing placed yet) must
    // still land there, not silently fall back to the first accessory slot.
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'accessory', secondAccessoryIndex);

    const [placed] = useFitBuilderStore.getState().items;
    expect(placed).toMatchObject({
      x: secondAccessorySlot.x,
      y: secondAccessorySlot.y,
      templateSlotIndex: secondAccessoryIndex,
    });
  });

  it('does not let a later general add re-claim a slot an earlier explicit tap already filled', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    const secondAccessorySlot = findSlot('shorts-and-top', 'accessory', 1);
    const secondAccessoryIndex = FIT_TEMPLATES['shorts-and-top'].indexOf(secondAccessorySlot);
    const firstAccessorySlot = findSlot('shorts-and-top', 'accessory', 0);

    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'accessory', secondAccessoryIndex);
    // No explicit index this time -- a plain "Add item" pick.
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'accessory');

    const [, second] = useFitBuilderStore.getState().items;
    expect(second).toMatchObject({ x: firstAccessorySlot.x, y: firstAccessorySlot.y });
  });

  it('spirals a third item past both defined slots near the last slot instead of overlapping it', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'accessory');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'accessory');
    useFitBuilderStore.getState().addItem('wardrobe-item-3', 'accessory');
    const [, second, third] = useFitBuilderStore.getState().items;
    const distance = Math.hypot(third.x - second.x, third.y - second.y);

    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(0.2);
  });

  it('allows multiple items in the same category with no fixed-slot limit, never placing two on the exact same spot', () => {
    useFitBuilderStore.getState().selectTemplate(null);
    for (let i = 0; i < 12; i += 1) {
      useFitBuilderStore.getState().addItem(`item-${i}`, 'accessory');
    }

    const items = useFitBuilderStore.getState().items;
    expect(items).toHaveLength(12);
    const positions = new Set(items.map((item) => `${item.x.toFixed(4)},${item.y.toFixed(4)}`));
    expect(positions.size).toBe(12);
  });
});

describe('removeItem', () => {
  it('removes only the targeted item', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'shoes');
    const [top, shoes] = useFitBuilderStore.getState().items;

    useFitBuilderStore.getState().removeItem(top.id);

    const remaining = useFitBuilderStore.getState().items;
    expect(remaining).toEqual([shoes]);
  });

  it('clears the selection when the removed item was selected', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [top] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(top.id);

    useFitBuilderStore.getState().removeItem(top.id);

    expect(useFitBuilderStore.getState().selectedId).toBeNull();
  });

  it('leaves the selection alone when a different item is removed', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'shoes');
    const [top, shoes] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(top.id);

    useFitBuilderStore.getState().removeItem(shoes.id);

    expect(useFitBuilderStore.getState().selectedId).toBe(top.id);
  });
});

describe('updateItemTransform', () => {
  it("updates only the targeted item's transform, unlocking it from its template slot", () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'bottom');
    const [top, bottom] = useFitBuilderStore.getState().items;

    useFitBuilderStore.getState().updateItemTransform(top.id, { x: 0.1, y: 0.9, scale: 1.5, rotation: 30 });

    const updated = useFitBuilderStore.getState().items;
    expect(updated[0]).toMatchObject({ x: 0.1, y: 0.9, scale: 1.5, rotation: 30 });
    expect(updated[1]).toEqual(bottom);
  });
});

describe('bringToFront', () => {
  it('raises the targeted item above the current maximum z-index', () => {
    useFitBuilderStore.getState().selectTemplate('shorts-and-top');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().addItem('wardrobe-item-2', 'shoes');
    const [top, shoes] = useFitBuilderStore.getState().items;
    const maxZBefore = Math.max(top.zIndex, shoes.zIndex);

    useFitBuilderStore.getState().bringToFront(top.id);

    const updatedTop = useFitBuilderStore.getState().items.find((item) => item.id === top.id);
    expect(updatedTop?.zIndex).toBeGreaterThan(maxZBefore);
  });
});

describe('loadItems', () => {
  const savedPlacements: PlacedItem[] = [
    {
      id: 'placement-1',
      wardrobeItemId: 'wardrobe-item-1',
      category: 'top',
      templateSlotIndex: 3,
      x: 0.42,
      y: 0.18,
      scale: 1.3,
      rotation: 12,
      zIndex: 2,
    },
    {
      id: 'placement-2',
      wardrobeItemId: 'wardrobe-item-2',
      category: 'shoes',
      templateSlotIndex: null,
      x: 0.6,
      y: 0.8,
      scale: 0.9,
      rotation: -4,
      zIndex: 1,
    },
  ];

  it("seeds every item at its saved position, scale, rotation, and stacking order", () => {
    useFitBuilderStore.getState().loadItems(savedPlacements);

    expect(useFitBuilderStore.getState().items).toEqual(savedPlacements);
  });

  it('clears templateId, selection, and any chosen canvas background color, since a loaded Fit carries none of its own', () => {
    useFitBuilderStore.getState().selectTemplate('layered-outerwear');
    useFitBuilderStore.getState().selectItem('some-id');
    useFitBuilderStore.getState().setCanvasBackgroundColor('#F6DADA');

    useFitBuilderStore.getState().loadItems(savedPlacements);

    expect(useFitBuilderStore.getState().templateId).toBeNull();
    expect(useFitBuilderStore.getState().selectedId).toBeNull();
    expect(useFitBuilderStore.getState().canvasBackgroundColor).toBeNull();
  });

  it('replaces any items already on the canvas rather than appending', () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-3', 'top');

    useFitBuilderStore.getState().loadItems(savedPlacements);

    expect(useFitBuilderStore.getState().items).toEqual(savedPlacements);
  });
});

describe('reset', () => {
  it('clears template, items, and selection', () => {
    useFitBuilderStore.getState().selectTemplate('layered-outerwear');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().selectItem('some-id');

    useFitBuilderStore.getState().reset();

    expect(useFitBuilderStore.getState()).toMatchObject({ templateId: null, items: [], selectedId: null });
  });

  it('also clears a chosen canvas background color', () => {
    useFitBuilderStore.getState().setCanvasBackgroundColor('#F6DADA');

    useFitBuilderStore.getState().reset();

    expect(useFitBuilderStore.getState().canvasBackgroundColor).toBeNull();
  });
});

describe('setCanvasBackgroundColor', () => {
  it('defaults to no override', () => {
    expect(useFitBuilderStore.getState().canvasBackgroundColor).toBeNull();
  });

  it('stores the chosen hex color', () => {
    useFitBuilderStore.getState().setCanvasBackgroundColor('#F6DADA');
    expect(useFitBuilderStore.getState().canvasBackgroundColor).toBe('#F6DADA');
  });

  it('clears back to the default when passed null', () => {
    useFitBuilderStore.getState().setCanvasBackgroundColor('#F6DADA');
    useFitBuilderStore.getState().setCanvasBackgroundColor(null);
    expect(useFitBuilderStore.getState().canvasBackgroundColor).toBeNull();
  });
});
