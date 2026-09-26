import { isNoConnectionError } from '@/lib/auth/errors';

export type FitErrorKind = 'no_connection' | 'unknown';

/**
 * Its own class rather than reusing `WardrobeItemError` -- that class is
 * wardrobe-domain-specific and already flagged (epic-1 retro) for a rename
 * since it's grown past its original scope. Fits get a clean domain error
 * from the start instead of adding a third domain to it.
 */
export class FitError extends Error {
  kind: FitErrorKind;

  constructor(kind: FitErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'FitError';
  }
}

export { isNoConnectionError };

/**
 * The Fits, plans and wears reads throw an already-classified `FitError`,
 * while `useFits` lets the raw Supabase error through -- this covers both.
 */
export function isOffline(error: unknown) {
  return error instanceof FitError ? error.kind === 'no_connection' : isNoConnectionError(error);
}

/**
 * Own copy of this string, not a shared import -- `lib/wardrobe/errors.ts`
 * keeps its own copy separate from `lib/auth/errors.ts`'s for the same
 * reason: each domain's wording is free to diverge later even though it
 * reads identically today.
 */
export const NO_CONNECTION_MESSAGE = 'No connection — nothing was lost. Try again.';

export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';
