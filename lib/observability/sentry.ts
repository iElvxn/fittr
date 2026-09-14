import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Crash reporting from first launch. With no DSN configured, `Sentry.init`
 * is a safe no-op (the SDK simply doesn't transport events), so this can run
 * unconditionally before a real DSN exists.
 */
export function initSentry() {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
