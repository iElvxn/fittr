import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeCaptureStore } from '@/stores/wardrobeCapture';
import { captureFromCamera, pickFromLibrary, type CaptureSource } from '@/lib/wardrobe/capture';
import { processWardrobePhoto } from '@/lib/wardrobe/processImage';
import { uploadItem, insertWardrobeItem, CATEGORY_OPTIONS } from '@/lib/wardrobe/addItem';
import { WardrobeItemError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/wardrobe/errors';
import { trackItemAdded } from '@/lib/analytics/posthog';
import { Sentry } from '@/lib/observability/sentry';

/**
 * A small curated palette, not a full color picker -- matches the spec's
 * Code Map wording ("color swatches"). The auto-detected color is applied
 * to `colorHex` as soon as processing finishes; tapping a swatch here just
 * overrides it before Save, per the "user-editable" boundary.
 *
 * Each swatch carries a human-readable name for its accessibility label --
 * without one, a screen reader would read the raw hex digits aloud.
 */
const COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#0C0A09', name: 'Black' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#78716C', name: 'Gray' },
  { hex: '#1E3A8A', name: 'Navy' },
  { hex: '#DBEAFE', name: 'Light blue' },
  { hex: '#78350F', name: 'Brown' },
  { hex: '#D6D3D1', name: 'Beige' },
  { hex: '#7F1D1D', name: 'Red' },
  { hex: '#EA580C', name: 'Orange' },
  { hex: '#CA8A04', name: 'Yellow' },
  { hex: '#166534', name: 'Green' },
  { hex: '#4C1D95', name: 'Purple' },
  { hex: '#DB2777', name: 'Pink' },
];

export default function AddItem() {
  const { session } = useSession();
  const userId = session?.user.id;
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();

  const source = useWardrobeCaptureStore((state) => state.source);
  const status = useWardrobeCaptureStore((state) => state.status);
  const errorMessage = useWardrobeCaptureStore((state) => state.errorMessage);
  const cutoutUri = useWardrobeCaptureStore((state) => state.cutoutUri);
  const thumbUri = useWardrobeCaptureStore((state) => state.thumbUri);
  const itemId = useWardrobeCaptureStore((state) => state.itemId);
  const category = useWardrobeCaptureStore((state) => state.category);
  const colorHex = useWardrobeCaptureStore((state) => state.colorHex);
  const name = useWardrobeCaptureStore((state) => state.name);
  const brand = useWardrobeCaptureStore((state) => state.brand);
  const notes = useWardrobeCaptureStore((state) => state.notes);

  const startCapture = useWardrobeCaptureStore((state) => state.startCapture);
  const setProcessed = useWardrobeCaptureStore((state) => state.setProcessed);
  const setProcessingFailed = useWardrobeCaptureStore((state) => state.setProcessingFailed);
  const retake = useWardrobeCaptureStore((state) => state.retake);
  const setCategory = useWardrobeCaptureStore((state) => state.setCategory);
  const setColorHex = useWardrobeCaptureStore((state) => state.setColorHex);
  const setName = useWardrobeCaptureStore((state) => state.setName);
  const setBrand = useWardrobeCaptureStore((state) => state.setBrand);
  const setNotes = useWardrobeCaptureStore((state) => state.setNotes);
  const reset = useWardrobeCaptureStore((state) => state.reset);

  const [submitting, setSubmitting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // `processWardrobePhoto` can take real time (on-device background
  // removal); if the user backs out while it's still running, the promise
  // still resolves after this screen unmounts. Since the store is global,
  // an unguarded `setProcessed`/`setProcessingFailed` at that point would
  // silently repopulate a future, unrelated capture session with this
  // abandoned one's result. Checked after every await in `runCapture`.
  const mountedRef = useRef(true);

  /** Runs the pipeline for a freshly picked/captured photo -- shared by the initial source choice and by Retake (which reuses the same source). */
  async function runCapture(pickedSource: CaptureSource) {
    try {
      const result = pickedSource === 'camera' ? await captureFromCamera() : await pickFromLibrary();
      if ('cancelled' in result) {
        // Nothing captured yet -- matches the "user backs out" matrix row.
        router.back();
        return;
      }

      startCapture(pickedSource, result.uri);
      const processed = await processWardrobePhoto(result.uri);
      if (!mountedRef.current) {
        return;
      }
      setProcessed(processed);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      if (!(error instanceof WardrobeItemError)) {
        // An unclassified failure -- everything expected (no connection,
        // no subject found) is already a WardrobeItemError by this point,
        // so anything else here is worth seeing rather than silently
        // collapsing into the generic message.
        console.error('[add-item] capture pipeline failed:', error);
        Sentry.captureException(error);
      }
      const message = error instanceof WardrobeItemError ? error.message : UNKNOWN_ERROR_MESSAGE;
      setProcessingFailed(message);
    }
  }

  // The action sheet is this screen's entry point -- it opens once the
  // modal has actually finished sliding into view, matching "source choice
  // -> processing -> review." Firing it synchronously on mount races this
  // screen's own native modal-presentation animation: the sheet can be
  // asked to attach to a view controller that's still mid-transition and
  // never properly display, leaving only the blank content view behind it.
  // `InteractionManager` doesn't help here -- it tracks JS-thread/Animated
  // API activity, not a native-stack screen's UIKit-driven transition --
  // so this waits on native-stack's own `transitionEnd` event instead,
  // which fires only once the real animation has completed.
  //
  // The unmount cleanup guarantees no orphaned session state survives any
  // exit path (Save success, Cancel, swipe-to-dismiss, or the sheet's own
  // Cancel), without every exit handler having to remember to call reset().
  const hasPromptedRef = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing || hasPromptedRef.current) {
        return;
      }
      hasPromptedRef.current = true;

      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 },
        (buttonIndex) => {
          if (buttonIndex === 2) {
            router.back();
            return;
          }
          void runCapture(buttonIndex === 0 ? 'camera' : 'library');
        },
      );
    });

    return () => {
      unsubscribe();
      mountedRef.current = false;
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount by design; navigation/reset are stable.
  }, []);

  function handleRetake() {
    if (!source) {
      router.back();
      return;
    }
    retake();
    void runCapture(source);
  }

  async function handleSave() {
    if (submitting) {
      return;
    }

    // Session expiry mid-flow is the one condition here a real user can
    // actually hit -- the rest (missing cutout/thumb/itemId/source) can't
    // happen while status is 'ready', so only this one gets user-facing
    // feedback instead of a silent no-op.
    if (!userId) {
      setFieldError(UNKNOWN_ERROR_MESSAGE);
      return;
    }
    if (!cutoutUri || !thumbUri || !itemId || !source) {
      return;
    }

    setSubmitting(true);
    setConnectionError(false);
    setFieldError(null);

    try {
      const { cutoutPath, thumbPath } = await uploadItem(userId, itemId, cutoutUri, thumbUri);
      await insertWardrobeItem(userId, itemId, {
        category,
        colorHex,
        name,
        brand,
        notes,
        cutoutPath,
        thumbPath,
      });

      trackItemAdded(source, category);
      router.dismissTo({ pathname: '/(tabs)/wardrobe', params: { itemAdded: '1' } });
    } catch (error) {
      if (error instanceof WardrobeItemError && error.kind === 'no_connection') {
        setConnectionError(true);
      } else {
        if (!(error instanceof WardrobeItemError)) {
          console.error('[add-item] save failed:', error);
          Sentry.captureException(error);
        }
        setFieldError(UNKNOWN_ERROR_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'idle') {
    return <View className="flex-1 bg-surface-base dark:bg-surface-baseDark" />;
  }

  if (status === 'processing') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
        <Text variant="body" className="text-ink-secondary dark:text-ink-secondaryDark">
          Removing background…
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View className="flex-1 justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
        <View className="mb-6">
          <ConnectionErrorNotice message={errorMessage ?? UNKNOWN_ERROR_MESSAGE} />
        </View>
        <Button title="Retake" variant="primary" onPress={handleRetake} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-base dark:bg-surface-baseDark"
    >
      <ScrollView className="flex-1">
        <View className="px-gutter pb-10 pt-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            className="mb-4 self-end"
          >
            <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
              Cancel
            </Text>
          </Pressable>

          {cutoutUri ? (
            <Image
              testID="item-cutout-preview"
              accessibilityLabel="Captured item"
              source={{ uri: cutoutUri }}
              style={{ width: '100%', height: 280 }}
              contentFit="contain"
            />
          ) : null}

          <View className="mt-6">
            <Text variant="label" className="mb-2 text-ink-secondary dark:text-ink-secondaryDark">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((option) => {
                const selected = option.value === category;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(option.value)}
                    className={[
                      'rounded-sm border px-4 py-2',
                      selected
                        ? 'border-ink-primary bg-ink-primary dark:border-ink-primaryDark dark:bg-ink-primaryDark'
                        : 'border-border-hairline dark:border-border-hairlineDark',
                    ].join(' ')}
                  >
                    <Text
                      variant="body"
                      className={
                        selected
                          ? 'text-surface-raised dark:text-surface-baseDark'
                          : 'text-ink-primary dark:text-ink-primaryDark'
                      }
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mt-6">
            <Text variant="label" className="mb-2 text-ink-secondary dark:text-ink-secondaryDark">
              Color
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {COLOR_SWATCHES.map(({ hex, name }) => {
                const selected = hex.toLowerCase() === colorHex?.toLowerCase();
                return (
                  <Pressable
                    key={hex}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    accessibilityState={{ selected }}
                    onPress={() => setColorHex(hex)}
                    hitSlop={8}
                    className={[
                      'h-8 w-8 rounded-full border',
                      selected
                        ? 'border-2 border-ink-primary dark:border-ink-primaryDark'
                        : 'border-border-hairline dark:border-border-hairlineDark',
                    ].join(' ')}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </View>
          </View>

          <View className="mt-6">
            <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
              Name (optional)
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              accessibilityLabel="Item name"
              className="mb-4 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />

            <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
              Brand (optional)
            </Text>
            <TextInput
              value={brand}
              onChangeText={setBrand}
              accessibilityLabel="Item brand"
              className="mb-4 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />

            <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
              Notes (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              accessibilityLabel="Item notes"
              className="mb-4 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />
          </View>

          {connectionError ? (
            <View className="mb-4">
              <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
            </View>
          ) : null}
          {fieldError ? (
            <Text variant="meta" className="mb-4 text-destructive dark:text-destructiveDark">
              {fieldError}
            </Text>
          ) : null}

          <Button title="Save" variant="primary" loading={submitting} onPress={handleSave} />
          <View className="mt-3">
            <Button title="Retake" onPress={handleRetake} disabled={submitting} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
