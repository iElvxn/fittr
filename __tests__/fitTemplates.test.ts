import { FIT_TEMPLATES, getTemplateSlots, isPointWithinSlotRange, type TemplateSlot } from '@/lib/fitBuilder/templates';

describe('getTemplateSlots', () => {
  it("returns the shorts-and-top template's single slot for a category seeded once", () => {
    expect(getTemplateSlots('shorts-and-top', 'top')).toEqual([
      FIT_TEMPLATES['shorts-and-top'].find((slot) => slot.category === 'top'),
    ]);
  });

  it('returns both slots, in template order, for a category seeded twice', () => {
    const accessorySlots = getTemplateSlots('shorts-and-top', 'accessory');
    expect(accessorySlots).toHaveLength(2);
    expect(accessorySlots).toEqual(FIT_TEMPLATES['shorts-and-top'].filter((slot) => slot.category === 'accessory'));
  });

  it('returns an empty array for a category the chosen template does not seed', () => {
    expect(getTemplateSlots('layered-outerwear', 'shoes')).toEqual([]);
  });

  it("returns the layered-outerwear template's slot for a category it seeds", () => {
    expect(getTemplateSlots('layered-outerwear', 'outerwear')).toEqual([
      FIT_TEMPLATES['layered-outerwear'].find((slot) => slot.category === 'outerwear'),
    ]);
  });

  it('never places two slots of the same template at the exact same position', () => {
    const positions = FIT_TEMPLATES['shorts-and-top'].map((slot) => `${slot.x},${slot.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe('isPointWithinSlotRange', () => {
  const slot: TemplateSlot = { category: 'top', x: 0.5, y: 0.5, width: 0.4, height: 0.2, scale: 1, rotation: 0, zIndex: 1 };
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 400;

  it('is true for a point at the slot center', () => {
    expect(isPointWithinSlotRange(slot, 0.5, 0.5, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(true);
  });

  it('is true for a point right at the edge of the slot rectangle', () => {
    // Half-width is 0.2 (40% of 300px / 2 = 60px -> 0.2 of canvas width)
    expect(isPointWithinSlotRange(slot, 0.7, 0.5, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(true);
  });

  it('is false for a point just past the slot rectangle', () => {
    expect(isPointWithinSlotRange(slot, 0.71, 0.5, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(false);
  });

  it('is false for a point nowhere near the slot', () => {
    expect(isPointWithinSlotRange(slot, 0.05, 0.05, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(false);
  });

  it('falls back to a fixed hit box for a zero-size slot (e.g. an accessory)', () => {
    const accessorySlot: TemplateSlot = { category: 'accessory', x: 0.5, y: 0.5, width: 0, height: 0, scale: 0.6, rotation: 0, zIndex: 1 };

    // 10px off-center is well within the 44px fallback hit box.
    expect(isPointWithinSlotRange(accessorySlot, 0.5 + 10 / CANVAS_WIDTH, 0.5, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(true);
    // 40px off-center clears it.
    expect(isPointWithinSlotRange(accessorySlot, 0.5 + 40 / CANVAS_WIDTH, 0.5, CANVAS_WIDTH, CANVAS_HEIGHT)).toBe(false);
  });

  it('is false before the canvas has measured a real size', () => {
    expect(isPointWithinSlotRange(slot, 0.5, 0.5, 0, 0)).toBe(false);
  });
});
