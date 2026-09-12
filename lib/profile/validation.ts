export type DisplayNameValidationError = { message: string };

const MAX_DISPLAY_NAME_LENGTH = 50;

/** Required, non-blank after trim, capped at a sane length. */
export function validateDisplayName(name: string): DisplayNameValidationError | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return { message: 'Enter a display name.' };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { message: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` };
  }
  return null;
}
