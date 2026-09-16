import { isNoConnectionError } from '@/lib/auth/errors';

export type WardrobeItemErrorKind = 'no_connection' | 'processing_failed' | 'permission_denied' | 'unknown';

/**
 * Not a fork of `SignUpError` -- that class is auth-specific and already
 * flagged for a future rename (it now covers sign-up, sign-in, and
 * profile/avatar errors too). Wardrobe gets its own error type instead of
 * adding a fourth domain to an auth-named class.
 */
export class WardrobeItemError extends Error {
  kind: WardrobeItemErrorKind;

  constructor(kind: WardrobeItemErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'WardrobeItemError';
  }
}

export { isNoConnectionError };

/**
 * Block-and-keep copy for a failed save: the cutout/fields stay on screen
 * with a retry action, matching the app-wide no-connection pattern (distinct
 * wording from auth's `NO_CONNECTION_MESSAGE` per the I/O matrix).
 */
export const NO_CONNECTION_MESSAGE = 'No connection — nothing was lost. Try again.';

/** Background removal found no subject in the photo. */
export const NO_SUBJECT_FOUND_MESSAGE =
  "Couldn't find your item in that photo. Try again with better lighting or a plain background.";

/** Generic fallback for anything else unexpected in the capture/save pipeline. */
export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Camera permission was never granted (or was denied) when `rapidCamera.ts` needed it. */
export const CAMERA_PERMISSION_MESSAGE =
  'Fittr needs camera access to take a photo. Enable it in Settings, or choose from your library instead.';
