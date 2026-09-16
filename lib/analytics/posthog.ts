import PostHog from 'posthog-react-native';

import type { CaptureSource } from '@/lib/wardrobe/capture';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

/**
 * Singleton PostHog client, wired against placeholder env vars until real
 * values are supplied. Constructed unconditionally so the provider/hooks
 * always have a client, but `trackSignedUp` below is a no-op until a real
 * API key exists, so nothing is sent to a placeholder project.
 */
export const posthog = new PostHog(apiKey || 'phc_placeholder_until_configured', {
  host: host || 'https://us.i.posthog.com',
});

if (!apiKey) {
  void posthog.optOut();
}

export type SignUpMethod = 'apple' | 'google' | 'email';

/** Fired once per successful sign-up, per the I/O matrix and acceptance criteria. */
export function trackSignedUp(method: SignUpMethod) {
  posthog.capture('signed_up', { method });
}

/** Fired once per successful item save, per the epic's analytics plumbing (source: camera/library, category). */
export function trackItemAdded(source: CaptureSource, category: WardrobeItemCategory) {
  posthog.capture('item_added', { source, category });
}
