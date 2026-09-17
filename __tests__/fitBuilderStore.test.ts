let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

import { useFitBuilderStore } from '@/stores/fitBuilder';
import { FIT_TEMPLATES } from '@/lib/fitBuilder/templates';

function findSlot(templateId: keyof typeof FIT_TEMPLATES, category: string, index = 0) {
  return FIT_TEMPLATES[templateId].filter((slot) => slot.category === category)[index];
}

beforeEach(() => {
  mockUuidCounter = 0;
  useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null });
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

describe('reset', () => {
  it('clears template, items, and selection', () => {
    useFitBuilderStore.getState().selectTemplate('layered-outerwear');
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    useFitBuilderStore.getState().selectItem('some-id');

    useFitBuilderStore.getState().reset();

    expect(useFitBuilderStore.getState()).toMatchObject({ templateId: null, items: [], selectedId: null });
  });
});
