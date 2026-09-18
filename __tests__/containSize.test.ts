import { containSize } from '@/lib/fitBuilder/aspectFit';

describe('containSize', () => {
  it('fills the full square for a 1:1 image', () => {
    expect(containSize(500, 500, 190)).toEqual({ width: 190, height: 190 });
  });

  it('shrinks the width for a portrait image (e.g. long pants), keeping height at the max', () => {
    const { width, height } = containSize(400, 1000, 190);
    expect(height).toBe(190);
    expect(width).toBeCloseTo(76); // 400/1000 * 190
  });

  it('shrinks the height for a landscape image (e.g. shoes), keeping width at the max', () => {
    const { width, height } = containSize(800, 300, 190);
    expect(width).toBe(190);
    expect(height).toBeCloseTo(71.25); // 300/800 * 190
  });

  it('falls back to a full square when natural size is not yet known', () => {
    expect(containSize(0, 0, 190)).toEqual({ width: 190, height: 190 });
  });
});
