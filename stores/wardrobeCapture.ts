import { create } from 'zustand';
import * as Crypto from 'expo-crypto';

import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { CaptureSource } from '@/lib/wardrobe/capture';

type CaptureStatus = 'idle' | 'processing' | 'ready' | 'error';

type WardrobeCaptureState = {
  source: CaptureSource | null;
  /** Raw picked/captured photo -- never uploaded (NFR4); kept only so `retake` knows which source to relaunch. */
  photoUri: string | null;
  cutoutUri: string | null;
  thumbUri: string | null;
  /**
   * Generated once the cutout is ready, not per Save attempt -- a retried
   * Save (after a dropped connection) must reuse the same id, or
   * `addItem.ts`'s upsert-based idempotency can't do its job and a failed
   * upload's orphaned Storage object would never be overwritten.
   */
  itemId: string | null;
  status: CaptureStatus;
  errorMessage: string | null;

  category: WardrobeItemCategory;
  colorHex: string | null;
  name: string;
  brand: string;
  notes: string;

  startCapture: (source: CaptureSource, photoUri: string) => void;
  setProcessed: (result: { cutoutUri: string; thumbUri: string; colorHex: string | null }) => void;
  setProcessingFailed: (message: string) => void;
  retake: () => void;
  setCategory: (category: WardrobeItemCategory) => void;
  setColorHex: (colorHex: string) => void;
  setName: (name: string) => void;
  setBrand: (brand: string) => void;
  setNotes: (notes: string) => void;
  reset: () => void;
};

/** First entry in the fixed category enum -- an arbitrary but harmless starting selection, freely changed before Save. */
const DEFAULT_CATEGORY: WardrobeItemCategory = 'top';

const initialState = {
  source: null as CaptureSource | null,
  photoUri: null as string | null,
  cutoutUri: null as string | null,
  thumbUri: null as string | null,
  itemId: null as string | null,
  status: 'idle' as CaptureStatus,
  errorMessage: null as string | null,
  category: DEFAULT_CATEGORY,
  colorHex: null as string | null,
  name: '',
  brand: '',
  notes: '',
};

/**
 * In-progress single-item capture/review state. Everything here is
 * discarded on save or on backing out (`reset`) -- TanStack Query owns the
 * actual wardrobe data once a save lands in Supabase, so nothing here is
 * persisted.
 */
export const useWardrobeCaptureStore = create<WardrobeCaptureState>((set) => ({
  ...initialState,

  startCapture: (source, photoUri) =>
    set({
      source,
      photoUri,
      cutoutUri: null,
      thumbUri: null,
      status: 'processing',
      errorMessage: null,
    }),

  setProcessed: ({ cutoutUri, thumbUri, colorHex }) =>
    set({ cutoutUri, thumbUri, colorHex, itemId: Crypto.randomUUID(), status: 'ready', errorMessage: null }),

  setProcessingFailed: (message) =>
    set({ status: 'error', errorMessage: message, cutoutUri: null, thumbUri: null }),

  /**
   * Discards the in-memory cutout/photo and drops back to `idle` so the
   * screen can relaunch capture from the same `source` -- per the matrix,
   * nothing has been uploaded or inserted yet at this point, so there's
   * nothing else to undo.
   */
  retake: () =>
    set({ photoUri: null, cutoutUri: null, thumbUri: null, itemId: null, status: 'idle', errorMessage: null }),

  setCategory: (category) => set({ category }),
  setColorHex: (colorHex) => set({ colorHex }),
  setName: (name) => set({ name }),
  setBrand: (brand) => set({ brand }),
  setNotes: (notes) => set({ notes }),

  reset: () => set(initialState),
}));
