import type { CategoryFilter } from '@/components/wardrobe/CategoryFilterChips';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

/**
 * Which category-slot a catalog pick lands in. Opening the sheet from a
 * specific ghost slot commits to that slot's own category regardless of the
 * picked item's real category -- switching filters inside the sheet is just
 * to help find the item, not a constraint on where it can go. Opening via
 * the unfiltered "Add item" bar has no slot in play, so it falls back to the
 * item's own category.
 */
export function resolvePlacementCategory(
  openedFor: CategoryFilter,
  itemCategory: WardrobeItemCategory,
): WardrobeItemCategory {
  return openedFor === 'all' ? itemCategory : openedFor;
}
