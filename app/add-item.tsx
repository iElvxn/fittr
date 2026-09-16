import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { CameraView } from 'expo-camera';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { BatchQueueRow } from '@/components/wardrobe/BatchQueueRow';
import { CameraFilmstrip } from '@/components/wardrobe/CameraFilmstrip';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeCaptureStore, type BatchItem } from '@/stores/wardrobeCapture';
import { pickFromLibrary } from '@/lib/wardrobe/capture';
import { ensureCameraPermission, capturePhoto, type CameraRef } from '@/lib/wardrobe/rapidCamera';
import { processWardrobePhoto } from '@/lib/wardrobe/processImage';
import { saveBatch } from '@/lib/wardrobe/addItem';
import { WardrobeItemError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/wardrobe/errors';
import { trackItemAdded } from '@/lib/analytics/posthog';
import { Sentry } from '@/lib/observability/sentry';

/** Past this many items in one session, a non-blocking note appears -- never a block (per spec's Boundaries). */
const SOFT_BATCH_SIZE_WARNING = 20;
const SOFT_BATCH_SIZE_MESSAGE = "That's a lot of items for one batch, but you can keep going.";
/** Balances the header/footer row against the text on its other side -- same value everywhere so the two screens don't drift. */
const HEADER_SPACER_WIDTH = 60;

type ScreenMode = 'choosing' | 'camera' | 'reviewing' | 'permission-error';

export default function AddItem() {
  const { session } = useSession();
  const userId = session?.user.id;
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const insets = useSafeAreaInsets();

  const items = useWardrobeCaptureStore((state) => state.items);
  const addCaptured = useWardrobeCaptureStore((state) => state.addCaptured);
  const setItemProcessed = useWardrobeCaptureStore((state) => state.setItemProcessed);
  const setItemProcessingFailed = useWardrobeCaptureStore((state) => state.setItemProcessingFailed);
  const replaceItemPhoto = useWardrobeCaptureStore((state) => state.replaceItemPhoto);
  const removeItem = useWardrobeCaptureStore((state) => state.removeItem);
  const setItemCategory = useWardrobeCaptureStore((state) => state.setItemCategory);
  const setItemColorHex = useWardrobeCaptureStore((state) => state.setItemColorHex);
  const setItemName = useWardrobeCaptureStore((state) => state.setItemName);
  const setItemBrand = useWardrobeCaptureStore((state) => state.setItemBrand);
  const setItemNotes = useWardrobeCaptureStore((state) => state.setItemNotes);
  const toggleExpanded = useWardrobeCaptureStore((state) => state.toggleExpanded);
  const reset = useWardrobeCaptureStore((state) => state.reset);

  const [mode, setMode] = useState<ScreenMode>('choosing');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [retakingId, setRetakingId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null) as CameraRef;
  // Guards against a fast double-tap firing two overlapping native
  // `takePictureAsync` calls -- during a retake this could otherwise read
  // `retakingId` after the first tap already cleared it, silently turning
  // an intended retake into an unrelated new batch item.
  const capturingRef = useRef(false);

  const allReady = items.length > 0 && items.every((item) => item.status === 'ready');

  // A photo's background removal can take real time; if the user backs out
  // while one is still in flight, its eventual `setItemProcessed`/
  // `setItemProcessingFailed` call still lands on the *global* store and can
  // corrupt the next capture session's state. Checked after every await.
  const mountedRef = useRef(true);

  async function processItem(id: string, photoUri: string) {
    try {
      const processed = await processWardrobePhoto(photoUri);
      if (!mountedRef.current) {
        return;
      }
      setItemProcessed(id, processed);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      if (!(error instanceof WardrobeItemError)) {
        console.error('[add-item] processing failed:', error);
        Sentry.captureException(error);
      }
      const message = error instanceof WardrobeItemError ? error.message : UNKNOWN_ERROR_MESSAGE;
      setItemProcessingFailed(id, message);
    }
  }

  async function handleChooseCamera() {
    try {
      await ensureCameraPermission();
      setMode('camera');
    } catch (error) {
      if (!(error instanceof WardrobeItemError)) {
        console.error('[add-item] camera permission request failed:', error);
        Sentry.captureException(error);
      }
      const message = error instanceof WardrobeItemError ? error.message : UNKNOWN_ERROR_MESSAGE;
      setPermissionError(message);
      setMode('permission-error');
    }
  }

  /** Processes picked photos one at a time -- background removal must stay sequential across a batch (epic's Technical Decision), never run concurrently. */
  async function processSequentially(pairs: { id: string; photoUri: string }[]) {
    for (const { id, photoUri } of pairs) {
      await processItem(id, photoUri);
    }
  }

  async function handleChooseLibrary() {
    const result = await pickFromLibrary();
    if ('cancelled' in result) {
      router.back();
      return;
    }
    // Items are added to the store up front so the queue screen shows all of
    // them immediately (each starts in 'processing'); only the actual
    // background-removal work is chained sequentially in the background.
    const pairs = result.uris.map((uri) => ({ id: addCaptured('library', uri), photoUri: uri }));
    setMode('reviewing');
    void processSequentially(pairs);
  }

  // The action sheet is this screen's entry point -- it opens once the modal
  // has actually finished sliding into view. Firing it synchronously on
  // mount races this screen's own native modal-presentation animation, so
  // this waits on native-stack's own `transitionEnd` event instead.
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
          void (buttonIndex === 0 ? handleChooseCamera() : handleChooseLibrary());
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

  async function handleShutterPress() {
    if (capturingRef.current) {
      return;
    }
    capturingRef.current = true;
    try {
      const photoUri = await capturePhoto(cameraRef);
      setCaptureError(null);
      if (retakingId) {
        const id = retakingId;
        setRetakingId(null);
        replaceItemPhoto(id, photoUri);
        void processItem(id, photoUri);
        setMode('reviewing');
        return;
      }
      const id = addCaptured('camera', photoUri);
      void processItem(id, photoUri);
    } catch (error) {
      if (!(error instanceof WardrobeItemError)) {
        console.error('[add-item] shutter capture failed:', error);
        Sentry.captureException(error);
      }
      setCaptureError(error instanceof WardrobeItemError ? error.message : UNKNOWN_ERROR_MESSAGE);
    } finally {
      capturingRef.current = false;
    }
  }

  async function handleRetake(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }
    if (item.source === 'library') {
      const result = await pickFromLibrary({ allowsMultipleSelection: false });
      if ('cancelled' in result) {
        return;
      }
      const [photoUri] = result.uris;
      replaceItemPhoto(id, photoUri);
      void processItem(id, photoUri);
      return;
    }
    setRetakingId(id);
    setMode('camera');
  }

  function handleRemove(id: string) {
    // Removing the batch's last item leaves nothing to review -- treat it
    // the same as the "nothing captured" case rather than showing an empty
    // queue screen with a permanently-disabled Save button.
    if (items.length <= 1) {
      router.back();
      return;
    }
    removeItem(id);
  }

  async function handleSaveAll() {
    if (submitting || !allReady) {
      return;
    }
    if (!userId) {
      setFieldError(UNKNOWN_ERROR_MESSAGE);
      return;
    }

    setSubmitting(true);
    setConnectionError(false);
    setFieldError(null);

    try {
      await saveBatch(
        userId,
        items.map((item) => ({
          itemId: item.itemId as string,
          cutoutUri: item.cutoutUri as string,
          thumbUri: item.thumbUri as string,
          category: item.category,
          colorHex: item.colorHex,
          name: item.name,
          brand: item.brand,
          notes: item.notes,
        })),
      );

      const batchSize = items.length;
      items.forEach((item) => trackItemAdded(item.source, item.category, batchSize));
      router.dismissTo({ pathname: '/(tabs)/wardrobe', params: { itemAdded: '1' } });
    } catch (error) {
      if (error instanceof WardrobeItemError && error.kind === 'no_connection') {
        setConnectionError(true);
      } else {
        if (!(error instanceof WardrobeItemError)) {
          console.error('[add-item] batch save failed:', error);
          Sentry.captureException(error);
        }
        setFieldError(UNKNOWN_ERROR_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'choosing') {
    return <View className="flex-1 bg-surface-base dark:bg-surface-baseDark" />;
  }

  if (mode === 'permission-error') {
    return (
      <View className="flex-1 justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
        <View className="mb-6">
          <ConnectionErrorNotice message={permissionError ?? UNKNOWN_ERROR_MESSAGE} />
        </View>
        <Button title="Try Again" variant="primary" onPress={handleChooseCamera} />
        <View className="mt-3">
          <Button title="Cancel" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (mode === 'camera') {
    const filmstripShots = items.map((item: BatchItem) => ({
      id: item.id,
      photoUri: item.cutoutUri ?? item.photoUri,
      status: item.status,
    }));

    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View className="absolute bottom-0 left-0 right-0 px-gutter pb-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <CameraFilmstrip shots={filmstripShots} />
          {items.length > SOFT_BATCH_SIZE_WARNING ? (
            <Text variant="meta" className="mt-2 text-center text-surface-raised">
              {SOFT_BATCH_SIZE_MESSAGE}
            </Text>
          ) : null}
          {captureError ? (
            <Text variant="meta" className="mt-2 text-center text-destructive dark:text-destructiveDark">
              {captureError}
            </Text>
          ) : null}
          <View className="mt-4 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => {
                if (retakingId) {
                  setRetakingId(null);
                  setMode('reviewing');
                  return;
                }
                router.back();
              }}
            >
              <Text variant="label" className="text-surface-raised">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              onPress={handleShutterPress}
              hitSlop={8}
              className="h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-surface-raised"
            />
            {items.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Review" onPress={() => setMode('reviewing')}>
                <Text variant="label" className="text-surface-raised">
                  Review
                </Text>
              </Pressable>
            ) : (
              <View style={{ width: HEADER_SPACER_WIDTH }} />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-base dark:bg-surface-baseDark"
    >
      <View className="flex-row items-center justify-between px-gutter pb-4 pt-6">
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()}>
          <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
            Cancel
          </Text>
        </Pressable>
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Text>
        <View style={{ width: HEADER_SPACER_WIDTH }} />
      </View>

      {items.length > SOFT_BATCH_SIZE_WARNING ? (
        <Text variant="meta" className="px-gutter pb-2 text-ink-secondary dark:text-ink-secondaryDark">
          {SOFT_BATCH_SIZE_MESSAGE}
        </Text>
      ) : null}

      <ScrollView className="flex-1 px-gutter">
        {items.map((item) => (
          <BatchQueueRow
            key={item.id}
            item={item}
            onToggleExpand={toggleExpanded}
            onRetake={handleRetake}
            onRemove={handleRemove}
            onCategoryChange={setItemCategory}
            onColorChange={setItemColorHex}
            onNameChange={setItemName}
            onBrandChange={setItemBrand}
            onNotesChange={setItemNotes}
          />
        ))}
      </ScrollView>

      <View className="px-gutter pb-10 pt-4">
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
        <Button title="Save all" variant="primary" loading={submitting} disabled={!allReady} onPress={handleSaveAll} />
      </View>
    </KeyboardAvoidingView>
  );
}
