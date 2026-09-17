import Svg, { Path, Ellipse } from 'react-native-svg';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type PathCategory = Exclude<WardrobeItemCategory, 'accessory' | 'shoes'>;

const PATHS: Record<PathCategory, string> = {
  top: 'M35 6 C35 12 65 12 65 6 L82 18 L72 34 L64 26 L64 112 L36 112 L36 26 L28 34 L18 18 Z',
  outerwear: 'M32 4 C32 10 68 10 68 4 L90 20 L78 40 L68 30 L68 116 L32 116 L32 30 L22 40 L10 20 Z',
  bottom: 'M25 8 L75 8 L78 45 L78 110 L58 110 L58 55 L42 55 L42 110 L22 110 L22 45 Z',
};

type Props = {
  category: WardrobeItemCategory;
  width: number;
  height: number;
  color: string;
};

/**
 * Large filled garment silhouettes for the template preview and unfilled-
 * canvas-slot ghosts, matching the layout of the user-provided reference but
 * rendered in fittr's own light palette rather than its colors. Accessory
 * has no shape here -- jewelry/bags/hats/belts are too varied for one
 * silhouette to read as any of them, so it renders nothing (the reference
 * itself skips a shape for that category too).
 */
export function GarmentSilhouette({ category, width, height, color }: Props) {
  if (category === 'accessory') {
    return null;
  }

  if (category === 'shoes') {
    return (
      <Svg width={width} height={height} viewBox="0 0 100 120" fill={color}>
        <Ellipse cx={30} cy={70} rx={22} ry={15} />
        <Ellipse cx={70} cy={70} rx={22} ry={15} />
      </Svg>
    );
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 100 120" fill={color}>
      <Path d={PATHS[category]} />
    </Svg>
  );
}
