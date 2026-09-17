jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { clampPageIndex } from '@/components/fitBuilder/TemplatePicker';

describe('clampPageIndex', () => {
  it('passes through an index already inside range', () => {
    expect(clampPageIndex(1, 2)).toBe(1);
  });

  it('clamps a negative index (left-edge iOS rubber-banding) to 0', () => {
    expect(clampPageIndex(-1, 2)).toBe(0);
  });

  it('clamps an index past the last page (right-edge rubber-banding) to the last page', () => {
    expect(clampPageIndex(5, 2)).toBe(1);
  });
});
