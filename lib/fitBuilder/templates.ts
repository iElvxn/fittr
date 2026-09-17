import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

export type TemplateId = 'shorts-and-top' | 'layered-outerwear';

export type CanvasSlot = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
};

/**
 * One category slot in a template. `width`/`height` size that slot's ghost
 * silhouette (as fractions of the canvas), independent of `scale`, which
 * only applies to a real placed item's cutout image.
 */
export type TemplateSlot = CanvasSlot & {
  category: WardrobeItemCategory;
  width: number;
  height: number;
};

/**
 * A template is an ordered list of slots, not a one-per-category map -- a
 * template can seed more than one slot for the same category (e.g. two
 * Accessories slots), matching a user-provided reference design. Sets only
 * each item's *starting* placement -- never a fixed frame. Coordinates are
 * percentages (0-1) of canvas width/height, not pixels, so they hold up
 * across device sizes. Once an item occupies a slot it is immediately
 * freeform: dragging, pinching, or rotating it carries no memory of which
 * slot it came from.
 */
export const FIT_TEMPLATES: Record<TemplateId, TemplateSlot[]> = {
  // Positions/sizes matched to a user-provided reference screenshot of this
  // exact template. Coats & Jackets sits behind Tops (lower z-index) so
  // their overlapping corner reads the same way as the reference.
  'shorts-and-top': [
    { category: 'accessory', x: 0.27, y: 0.11, width: 0, height: 0, scale: 1, rotation: 0, zIndex: 1 },
    { category: 'outerwear', x: 0.73, y: 0.2, width: 0.55, height: 0.32, scale: 1, rotation: 0, zIndex: 1 },
    { category: 'top', x: 0.34, y: 0.44, width: 0.52, height: 0.36, scale: 1, rotation: 0, zIndex: 2 },
    { category: 'accessory', x: 0.72, y: 0.56, width: 0, height: 0, scale: 1, rotation: 0, zIndex: 1 },
    { category: 'bottom', x: 0.35, y: 0.75, width: 0.55, height: 0.4, scale: 1, rotation: 0, zIndex: 1 },
    { category: 'shoes', x: 0.73, y: 0.87, width: 0.32, height: 0.13, scale: 0.8, rotation: 0, zIndex: 1 },
  ],
  'layered-outerwear': [
    { category: 'top', x: 0.5, y: 0.35, width: 0.42, height: 0.34, scale: 0.9, rotation: 0, zIndex: 1 },
    { category: 'outerwear', x: 0.5, y: 0.3, width: 0.5, height: 0.4, scale: 1, rotation: -4, zIndex: 2 },
  ],
};

export const TEMPLATE_OPTIONS: { id: TemplateId; label: string; description: string }[] = [
  { id: 'shorts-and-top', label: 'Shorts and Top', description: 'Seeds tops, bottoms, shoes, outerwear, and accessories' },
  { id: 'layered-outerwear', label: 'Layered Outerwear', description: 'Seeds a base layer plus outerwear' },
];

/** All slots seeded for `category` in template order -- may be empty, one, or several (e.g. two Accessories slots). */
export function getTemplateSlots(templateId: TemplateId, category: WardrobeItemCategory): TemplateSlot[] {
  return FIT_TEMPLATES[templateId].filter((slot) => slot.category === category);
}
