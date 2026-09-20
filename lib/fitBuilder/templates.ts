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
    // Accessories default smaller -- small items (jewelry, belts, hats)
    // looked oversized at the same default scale as full garments.
    { category: 'accessory', x: 0.27, y: 0.09, width: 0, height: 0, scale: 0.6, rotation: 0, zIndex: 1 },
    { category: 'outerwear', x: 0.73, y: 0.2, width: 0.55, height: 0.32, scale: 1, rotation: 0, zIndex: 1 },
    { category: 'top', x: 0.29, y: 0.4, width: 0.6, height: 0.41, scale: 1.15, rotation: 0, zIndex: 2 },
    { category: 'accessory', x: 0.72, y: 0.56, width: 0, height: 0, scale: 0.6, rotation: 0, zIndex: 1 },
    // Bottoms default larger once placed (see `scale` below), but the ghost
    // preview itself stays modest -- it's sized as a canvas-relative
    // fraction while a placed item is capped at a fixed pixel size, so the
    // two were never on the same basis and the ghost was reading larger
    // than the actual pants a user places.
    { category: 'bottom', x: 0.3, y: 0.75, width: 0.42, height: 0.32, scale: 1.5, rotation: 0, zIndex: 1 },
    { category: 'shoes', x: 0.73, y: 0.83, width: 0.32, height: 0.13, scale: 0.8, rotation: 0, zIndex: 1 },
  ],
  // Only two slots by design (a base layer plus outerwear, no bottoms/shoes)
  // -- centered around the card's vertical midpoint, at a larger size than
  // "shorts-and-top"'s individual slots, so the pair still reads as a
  // deliberate composition rather than two small shapes stranded near the
  // top of a much taller card.
  'layered-outerwear': [
    { category: 'top', x: 0.5, y: 0.48, width: 0.5, height: 0.38, scale: 0.9, rotation: 0, zIndex: 1 },
    { category: 'outerwear', x: 0.5, y: 0.42, width: 0.6, height: 0.46, scale: 1, rotation: -4, zIndex: 2 },
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

/**
 * The accessory slots above render no silhouette (`width`/`height` both 0)
 * -- they'd otherwise need a placed item's center to land on the exact
 * pixel their badge sits at to ever suppress the ghost, which is
 * unreachable in practice. This is the fallback hit box for those, sized to
 * roughly the badge's own footprint (see `GhostSlot`'s 44px circle).
 */
const MIN_SLOT_RANGE_PX = 44;

/**
 * Whether a point -- in practice, a placed item's own center -- falls
 * within a template slot's silhouette rectangle, in pixel space. Used to
 * suppress a still-unfilled ghost slot once something visually covers it,
 * independent of which slot (if any) actually "claimed" that item; see
 * `FitCanvas`'s `unfilledSlots`. Coordinates are all 0-1 canvas-relative
 * fractions, matching both `TemplateSlot` and `PlacedItem`.
 */
export function isPointWithinSlotRange(
  slot: TemplateSlot,
  pointX: number,
  pointY: number,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return false;
  }

  const halfWidthPx = Math.max((slot.width * canvasWidth) / 2, MIN_SLOT_RANGE_PX / 2);
  const halfHeightPx = Math.max((slot.height * canvasHeight) / 2, MIN_SLOT_RANGE_PX / 2);
  const dxPx = Math.abs(pointX * canvasWidth - slot.x * canvasWidth);
  const dyPx = Math.abs(pointY * canvasHeight - slot.y * canvasHeight);

  return dxPx <= halfWidthPx && dyPx <= halfHeightPx;
}
