import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Registered with the router's container in `app/_layout.tsx`, so traces split per screen. */
export const navigationIntegration = Sentry.reactNavigationIntegration();

/**
 * Crash reporting from first launch. With no DSN configured, `Sentry.init`
 * is a safe no-op (the SDK simply doesn't transport events), so this can run
 * unconditionally before a real DSN exists.
 */
export function initSentry() {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    // Every session while developing; a fifth of them in release builds.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    integrations: [navigationIntegration],
  });
}

/** Ties crashes to the signed-in user by id only (no email or name); `null` on sign-out. */
export function identifySentryUser(id: string | null) {
  Sentry.setUser(id ? { id } : null);
}

export { Sentry };
