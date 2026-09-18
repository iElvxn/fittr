import { FIT_TEMPLATES, getTemplateSlots } from '@/lib/fitBuilder/templates';

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
