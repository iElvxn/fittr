import { Image, type ImageSource } from 'expo-image';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type ImageCategory = Exclude<WardrobeItemCategory, 'accessory'>;

const SOURCES: Record<ImageCategory, ImageSource> = {
  top: require('@/assets/garments/top.webp'),
  outerwear: require('@/assets/garments/outerwear.webp'),
  bottom: require('@/assets/garments/bottom.webp'),
  shoes: require('@/assets/garments/shoes.webp'),
};

type Props = {
  category: WardrobeItemCategory;
  width: number;
  height: number;
  color: string;
};

/**
 * Garment silhouettes for the template preview and unfilled-canvas-slot
 * ghosts. Designed assets (not hand-drawn paths) -- each is a solid, fully
 * opaque shape on a transparent background, so `tintColor` can recolor it
 * for light/dark mode the same way the old SVG `fill` did. Accessory has no
 * shape here -- jewelry/bags/hats/belts are too varied for one silhouette to
 * read as any of them, so it renders nothing (the reference itself skips a
 * shape for that category too).
 */
export function GarmentSilhouette({ category, width, height, color }: Props) {
  if (category === 'accessory') {
    return null;
  }

  return (
    <Image
      source={SOURCES[category]}
      style={{ width, height }}
      contentFit="contain"
      tintColor={color}
    />
  );
}
