// Manual mock for `@react-native-google-signin/google-signin`.
//
// The real module calls into a native TurboModule at import time
// (`NativeModule.getConstants()` for `statusCodes`), which isn't available
// under Jest. Placed in `__mocks__` adjacent to `node_modules` per Jest's
// docs, this is applied automatically to every test — no `jest.mock(...)`
// call needed per file.

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  signIn: jest.fn(),
  signOut: jest.fn(),
};

// Mirrors the real (native-sourced) string values closely enough for
// equality checks in tests — the exact strings don't matter, only that
// `errors.ts` and test code compare against the same constants.
export const statusCodes = Object.freeze({
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  NULL_PRESENTER: 'NULL_PRESENTER',
});

export function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}
