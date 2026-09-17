import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Path, Ellipse } from 'react-native-svg';

import { GarmentSilhouette } from '@/components/fitBuilder/GarmentSilhouette';

function countElementsOfType(node: ReactNode, type: unknown): number {
  if (!isValidElement(node)) {
    return 0;
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  const self = element.type === type ? 1 : 0;
  const children = element.props.children;
  const childArray = Array.isArray(children) ? children : [children];
  return self + childArray.reduce((sum: number, child) => sum + countElementsOfType(child, type), 0);
}

describe('GarmentSilhouette', () => {
  it('renders nothing for accessory -- no single shape represents jewelry/bags/hats/belts', () => {
    expect(GarmentSilhouette({ category: 'accessory', width: 40, height: 40, color: '#E7E5E4' })).toBeNull();
  });

  it('renders a pair of ellipses for shoes', () => {
    const element = GarmentSilhouette({ category: 'shoes', width: 40, height: 20, color: '#E7E5E4' });
    expect(countElementsOfType(element, Ellipse)).toBe(2);
  });

  it.each(['top', 'bottom', 'outerwear'] as const)('renders a single path shape for %s', (category) => {
    const element = GarmentSilhouette({ category, width: 40, height: 40, color: '#E7E5E4' });
    expect(countElementsOfType(element, Path)).toBe(1);
  });
});
