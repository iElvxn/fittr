import { create } from 'zustand';
import * as Crypto from 'expo-crypto';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { CaptureSource } from '@/lib/wardrobe/capture';

export type BatchItemStatus = 'processing' | 'ready' | 'error';

export type BatchItem = {
  /** Stable UI key, assigned at capture time -- exists before processing finishes, unlike `itemId`. */
  id: string;
  source: CaptureSource;
  /** Raw picked/captured photo -- never uploaded (NFR4); kept only so a retake knows what it's replacing. */
  photoUri: string;
  cutoutUri: string | null;
  thumbUri: string | null;
  /**
   * Generated once this item's cutout is ready, not per Save attempt -- a
   * retried batch save (after a dropped connection) must reuse the same id,
   * or `addItem.ts`'s upsert-based idempotency can't do its job and a failed
   * upload's orphaned Storage object would never be overwritten.
   */
  itemId: string | null;
  status: BatchItemStatus;
  errorMessage: string | null;

  category: WardrobeItemCategory;
  colorHex: string | null;
  name: string;
  brand: string;
  notes: string;

  /** Whether this row's category/color/fields are shown, or collapsed to just its thumbnail + status. */
  expanded: boolean;
};

type WardrobeCaptureState = {
  items: BatchItem[];

  addCaptured: (source: CaptureSource, photoUri: string) => string;
  setItemProcessed: (id: string, result: { cutoutUri: string; thumbUri: string; colorHex: string | null }) => void;
  setItemProcessingFailed: (id: string, message: string) => void;
  replaceItemPhoto: (id: string, photoUri: string) => void;
  removeItem: (id: string) => void;
  setItemCategory: (id: string, category: WardrobeItemCategory) => void;
  setItemColorHex: (id: string, colorHex: string) => void;
  setItemName: (id: string, name: string) => void;
  setItemBrand: (id: string, brand: string) => void;
  setItemNotes: (id: string, notes: string) => void;
  toggleExpanded: (id: string) => void;
  reset: () => void;
};

/** First entry in the fixed category enum -- an arbitrary but harmless starting selection, freely changed before Save. */
const DEFAULT_CATEGORY: WardrobeItemCategory = 'top';

function mapItem(items: BatchItem[], id: string, update: (item: BatchItem) => BatchItem): BatchItem[] {
  return items.map((item) => (item.id === id ? update(item) : item));
}

/**
 * In-progress batch capture/review state -- single-item capture is simply
 * the batch-of-one case. Everything here is discarded on save or on backing
 * out (`reset`) -- TanStack Query owns the actual wardrobe data once a save
 * lands in Supabase, so nothing here is persisted.
 */
export const useWardrobeCaptureStore = create<WardrobeCaptureState>((set) => ({
  items: [],

  addCaptured: (source, photoUri) => {
    const id = Crypto.randomUUID();
    set((state) => ({
      items: [
        ...state.items,
        {
          id,
          source,
          photoUri,
          cutoutUri: null,
          thumbUri: null,
          itemId: null,
          status: 'processing',
          errorMessage: null,
          category: DEFAULT_CATEGORY,
          colorHex: null,
          name: '',
          brand: '',
          notes: '',
          expanded: false,
        },
      ],
    }));
    return id;
  },

  setItemProcessed: (id, { cutoutUri, thumbUri, colorHex }) =>
    set((state) => ({
      items: mapItem(state.items, id, (item) => ({
        ...item,
        cutoutUri,
        thumbUri,
        colorHex,
        itemId: Crypto.randomUUID(),
        status: 'ready',
        errorMessage: null,
      })),
    })),

  setItemProcessingFailed: (id, message) =>
    set((state) => ({
      items: mapItem(state.items, id, (item) => ({
        ...item,
        status: 'error',
        errorMessage: message,
        cutoutUri: null,
        thumbUri: null,
      })),
    })),

  /**
   * Discards the item's in-memory cutout and drops it back to `processing`
   * with the newly retaken photo -- per the matrix, nothing has been
   * uploaded or inserted yet at this point, so there's nothing else to undo.
   * Only called once a replacement photo actually exists; a cancelled
   * retake picker/camera leaves the item's prior state untouched.
   */
  replaceItemPhoto: (id, photoUri) =>
    set((state) => ({
      items: mapItem(state.items, id, (item) => ({
        ...item,
        photoUri,
        cutoutUri: null,
        thumbUri: null,
        itemId: null,
        status: 'processing',
        errorMessage: null,
      })),
    })),

  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  setItemCategory: (id, category) =>
    set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, category })) })),
  setItemColorHex: (id, colorHex) =>
    set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, colorHex })) })),
  setItemName: (id, name) => set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, name })) })),
  setItemBrand: (id, brand) => set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, brand })) })),
  setItemNotes: (id, notes) => set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, notes })) })),

  toggleExpanded: (id) =>
    set((state) => ({ items: mapItem(state.items, id, (item) => ({ ...item, expanded: !item.expanded })) })),

  reset: () => set({ items: [] }),
}));
