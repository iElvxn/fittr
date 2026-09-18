import { resolvePlacementCategory } from '@/lib/fitBuilder/placement';

describe('resolvePlacementCategory', () => {
  it("commits to the opened slot's category, even when the picked item is a different category", () => {
    expect(resolvePlacementCategory('top', 'shoes')).toBe('top');
  });

  it('leaves an exact-category pick in that same category', () => {
    expect(resolvePlacementCategory('shoes', 'shoes')).toBe('shoes');
  });

  it("falls back to the item's own category when opened unfiltered (the bottom \"Add item\" bar)", () => {
    expect(resolvePlacementCategory('all', 'shoes')).toBe('shoes');
  });
});
