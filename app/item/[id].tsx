import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, ScrollView, TextInput, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { ACTION_ICON_SIZE, DetailAction } from '@/components/ui/DetailAction';
import { PencilIcon } from '@/components/ui/icons/PencilIcon';
import { TrashIcon } from '@/components/ui/icons/TrashIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { CategoryPicker } from '@/components/wardrobe/CategoryPicker';
import { ColorSwatchPicker, colorLabel } from '@/components/wardrobe/ColorSwatchPicker';
import { ItemFitsStrip } from '@/components/wardrobe/ItemFitsStrip';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useItemFitIds } from '@/lib/wardrobe/itemFits';
import { useFits } from '@/lib/fits/listFits';
import { FitError, isNoConnectionError as isFitsNoConnectionError } from '@/lib/fits/errors';
import { updateWardrobeItem } from '@/lib/wardrobe/updateItem';
import { deleteWardrobeItem } from '@/lib/wardrobe/deleteItem';
import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import {
  WardrobeItemError,
  isNoConnectionError,
  NO_CONNECTION_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from '@/lib/wardrobe/errors';
import { Sentry } from '@/lib/observability/sentry';
import { colors } from '@/lib/theme/colors';

/** Same fixed 4:5 as Fit detail's collage frame; the cutout is contained, never cropped. */
const PHOTO_ASPECT_RATIO = 4 / 5;
/** Edit mode shrinks the photo well so the form gets the room. */
const EDIT_PHOTO_HEIGHT = 220;
const COLOR_DOT_SIZE = 12;
const NOTES_INPUT_HEIGHT = 96;
const ITALIC_SERIF = 'Newsreader_400Regular_Italic';
const ADDED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const INPUT_CLASS =
  'min-h-12 rounded-sm border border-border-hairline bg-surface-raised px-3.5 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:bg-surface-raisedDark dark:text-ink-primaryDark';

function Caption({ children, className }: { children: string; className?: string }) {
  return (
    <Text variant="caption" className={['text-ink-secondary dark:text-ink-secondaryDark', className ?? ''].join(' ')}>
      {children}
    </Text>
  );
}

type DetailRowProps = {
  testID: string;
  label: string;
  value: string;
  /** Muted value, e.g. Color's "Not set". */
  muted?: boolean;
  swatch?: string | null;
};

/** One hairline Details row: label left, value right. */
function DetailRow({ testID, label, value, muted, swatch }: DetailRowProps) {
  return (
    <View
      testID={testID}
      className="min-h-12 flex-row items-center justify-between gap-4 border-b border-border-hairline dark:border-border-hairlineDark"
    >
      <Text variant="meta" className="text-ink-secondary dark:text-ink-secondaryDark">
        {label}
      </Text>
      <View className="shrink flex-row items-center gap-2">
        {swatch ? (
          <View
            testID="item-detail-color-dot"
            className="rounded-full border border-border-hairline dark:border-border-hairlineDark"
            style={{ width: COLOR_DOT_SIZE, height: COLOR_DOT_SIZE, backgroundColor: swatch }}
          />
        ) : null}
        <Text
          variant="meta"
          className={
            muted ? 'shrink text-ink-secondary dark:text-ink-secondaryDark' : 'shrink text-ink-primary dark:text-ink-primaryDark'
          }
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Loading state in the view layout's shape -- never a bare spinner (EXPERIENCE.md). */
function ItemDetailSkeleton() {
  return (
    <View
      testID="item-detail-skeleton"
      className="px-gutter pt-1"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ aspectRatio: PHOTO_ASPECT_RATIO }} className="w-full rounded-lg bg-surface-tile dark:bg-surface-tileDark" />
      <View style={{ height: 10 }} className="mt-6 w-[30%] rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
      <View style={{ height: 30 }} className="mt-3 w-[72%] rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
      <View style={{ height: 12 }} className="mt-3 w-[26%] rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
      <View className="mt-9 h-px bg-border-hairline dark:bg-border-hairlineDark" />
      <View style={{ height: 12 }} className="mt-4 w-full rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
      <View style={{ height: 12 }} className="mt-5 w-full rounded-sm bg-surface-tile dark:bg-surface-tileDark" />
    </View>
  );
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  // Phase 1 has no pagination, so the grid's already-cached list is the
  // single source of truth here too -- no separate single-item query.
  const { data: items, isLoading, isError: isListError, error: listError, refetch: refetchItems } =
    useWardrobeItems(userId);
  const item = items?.find((candidate) => candidate.id === id);

  useEffect(() => {
    if (isListError && !isNoConnectionError(listError)) {
      Sentry.captureException(listError);
    }
  }, [isListError, listError]);

  const { data: thumbnailUrls } = useThumbnailUrls(item ? [item.cutout_path] : []);
  const cutoutUrl = item ? (thumbnailUrls?.[item.cutout_path] ?? null) : null;

  // The Fits that use this piece: its distinct fit_ids, joined on the device
  // against the cached `useFits` list -- so a soft-deleted Fit (absent from
  // that list) drops out, and the strip follows that list's order.
  const {
    data: itemFitIds,
    isError: isItemFitsError,
    error: itemFitsError,
    refetch: refetchItemFitIds,
  } = useItemFitIds(item?.id);
  const { data: fits, isError: isFitsError, error: fitsError } = useFits(userId);

  // Opening a Fit from the strip and editing it (adding/removing this piece)
  // returns to this still-mounted screen, so refetch on every focus.
  useFocusEffect(
    useCallback(() => {
      if (item?.id) {
        refetchItemFitIds();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, [item?.id]),
  );

  useEffect(() => {
    if (isFitsError && !isFitsNoConnectionError(fitsError)) {
      Sentry.captureException(fitsError);
    }
  }, [isFitsError, fitsError]);
  const isItemFitsNoConnection = itemFitsError instanceof FitError && itemFitsError.kind === 'no_connection';

  useEffect(() => {
    if (isItemFitsError && !isItemFitsNoConnection) {
      Sentry.captureException(itemFitsError);
    }
  }, [isItemFitsError, isItemFitsNoConnection, itemFitsError]);

  // `null` until both reads resolve (and on failure), which hides the whole
  // Fits section -- never a false "Not in a Fit yet.".
  const itemFits =
    !isItemFitsError && itemFitIds && fits
      ? fits.filter((fit) => itemFitIds.includes(fit.id))
      : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<WardrobeItemCategory>('top');
  const [editColorHex, setEditColorHex] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleStartEdit() {
    if (!item) {
      return;
    }
    setEditCategory(item.category);
    setEditColorHex(item.color_hex);
    setEditName(item.name ?? '');
    setEditBrand(item.brand ?? '');
    setEditNotes(item.notes ?? '');
    setErrorMessage(null);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setErrorMessage(null);
    setIsEditing(false);
  }

  function reportUnknownError(error: unknown) {
    Sentry.captureException(error);
    setErrorMessage(UNKNOWN_ERROR_MESSAGE);
  }

  async function handleSave() {
    if (!item) {
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      await updateWardrobeItem(item.id, {
        category: editCategory,
        colorHex: editColorHex,
        name: editName,
        brand: editBrand,
        notes: editNotes,
      });
      await queryClient.invalidateQueries({ queryKey: ['wardrobeItems', userId] });
      setIsEditing(false);
    } catch (error) {
      if (error instanceof WardrobeItemError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) {
      return;
    }
    setErrorMessage(null);
    setDeleting(true);
    try {
      await deleteWardrobeItem(item.id);
      await queryClient.invalidateQueries({ queryKey: ['wardrobeItems', userId] });
      router.back();
    } catch (error) {
      if (error instanceof WardrobeItemError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleDeletePress() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Delete', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          void handleDelete();
        }
      },
    );
  }

  const header = <BackHeader disabled={saving || deleting} />;

  if (!userId || isLoading) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <ItemDetailSkeleton />
      </View>
    );
  }

  if (isListError) {
    const message = isNoConnectionError(listError) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="px-gutter">
          <View className="mb-6">
            <ConnectionErrorNotice message={message} />
          </View>
          <Button title="Retry" variant="primary" onPress={() => refetchItems()} />
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            This item is no longer in your wardrobe.
          </Text>
        </View>
      </View>
    );
  }

  const cutout = cutoutUrl ? (
    <Image
      testID="item-detail-cutout"
      accessibilityLabel="Item photo"
      source={{ uri: cutoutUrl }}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
    />
  ) : (
    <View testID="item-detail-cutout-fallback" className="h-full w-full" />
  );

  if (isEditing) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <ScrollView contentContainerClassName="pb-6" keyboardShouldPersistTaps="handled">
          <View className="px-gutter pt-1">
            <View
              style={{ height: EDIT_PHOTO_HEIGHT }}
              className="w-full overflow-hidden rounded-lg bg-surface-tile dark:bg-surface-tileDark"
            >
              {cutout}
            </View>
          </View>

          <View className="gap-6 px-gutter pt-6">
            <View>
              <Caption className="mb-2.5">Category</Caption>
              <CategoryPicker value={editCategory} onChange={setEditCategory} />
            </View>

            <View>
              <Caption className="mb-1.5">Color</Caption>
              <ColorSwatchPicker value={editColorHex} onChange={setEditColorHex} />
            </View>

            <View>
              <Caption className="mb-2">Name</Caption>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Optional"
                placeholderTextColor={palette.inkSecondary}
                accessibilityLabel="Item name"
                className={INPUT_CLASS}
              />
            </View>

            <View>
              <Caption className="mb-2">Brand</Caption>
              <TextInput
                value={editBrand}
                onChangeText={setEditBrand}
                placeholder="Optional"
                placeholderTextColor={palette.inkSecondary}
                accessibilityLabel="Item brand"
                className={INPUT_CLASS}
              />
            </View>

            <View>
              <Caption className="mb-2">Notes</Caption>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Optional"
                placeholderTextColor={palette.inkSecondary}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Item notes"
                className={INPUT_CLASS}
                style={{ minHeight: NOTES_INPUT_HEIGHT }}
              />
            </View>
          </View>
        </ScrollView>
        <View
          testID="item-detail-edit-bar"
          style={{ paddingBottom: insets.bottom + 12 }}
          className="gap-2 border-t border-border-hairline bg-surface-base px-gutter pt-3.5 dark:border-border-hairlineDark dark:bg-surface-baseDark"
        >
          {errorMessage ? (
            <View className="mb-2">
              <ConnectionErrorNotice message={errorMessage} />
            </View>
          ) : null}
          <Button title="Save" variant="primary" loading={saving} onPress={handleSave} />
          <Button title="Cancel" variant="secondary" onPress={handleCancelEdit} disabled={saving} />
        </View>
      </View>
    );
  }

  const categoryLabel = CATEGORY_LABELS[item.category];
  const title = item.name?.trim() || categoryLabel;
  const hasCaption = Boolean(item.name?.trim());
  const color = colorLabel(item.color_hex);

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="px-gutter pt-1">
          <View
            style={{ aspectRatio: PHOTO_ASPECT_RATIO }}
            className="w-full overflow-hidden rounded-lg bg-surface-tile dark:bg-surface-tileDark"
          >
            {cutout}
          </View>
        </View>

        <View className="gap-2 px-gutter pt-6">
          {hasCaption ? (
            <Text
              testID="item-detail-category-caption"
              variant="caption"
              className="text-ink-secondary dark:text-ink-secondaryDark"
            >
              {categoryLabel}
            </Text>
          ) : null}
          <Text testID="item-detail-title" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
            {title}
          </Text>
          {item.brand ? (
            <Text testID="item-detail-brand" variant="body" className="text-ink-secondary dark:text-ink-secondaryDark">
              {item.brand}
            </Text>
          ) : null}
        </View>

        <View className="mx-gutter mt-6 flex-row border-y border-border-hairline py-2 dark:border-border-hairlineDark">
          <DetailAction label="Edit item" caption="Edit" onPress={handleStartEdit} disabled={deleting}>
            <PencilIcon size={ACTION_ICON_SIZE} color={deleting ? palette.inkDisabled : palette.inkPrimary} />
          </DetailAction>
          <DetailAction
            label="Delete item"
            caption="Delete"
            tone="destructive"
            onPress={handleDeletePress}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" />
            ) : (
              <TrashIcon size={ACTION_ICON_SIZE} color={palette.destructive} />
            )}
          </DetailAction>
        </View>

        {errorMessage ? (
          <View className="px-gutter pt-4">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}

        <View className="px-gutter pt-8">
          <Caption className="pb-1.5">Details</Caption>
          <DetailRow
            testID="item-detail-row-color"
            label="Color"
            value={color ?? 'Not set'}
            muted={!color}
            swatch={item.color_hex}
          />
          <DetailRow testID="item-detail-row-category" label="Category" value={categoryLabel} />
          {item.brand ? <DetailRow testID="item-detail-row-brand" label="Brand" value={item.brand} /> : null}
          <DetailRow
            testID="item-detail-row-added"
            label="Added"
            value={ADDED_AT_FORMAT.format(new Date(item.created_at))}
          />
        </View>

        {item.notes ? (
          <View className="gap-2.5 px-gutter pt-8">
            <Caption>Notes</Caption>
            <Text variant="body" className="text-ink-primary dark:text-ink-primaryDark">
              {item.notes}
            </Text>
          </View>
        ) : null}

        {itemFits ? (
          <View className="gap-3 pt-8">
            <Caption className="px-gutter">
              {itemFits.length === 0 ? 'Fits' : `In ${itemFits.length} ${itemFits.length === 1 ? 'Fit' : 'Fits'}`}
            </Caption>
            {itemFits.length > 0 ? (
              <ItemFitsStrip fits={itemFits} />
            ) : (
              <View className="items-start gap-2 px-gutter">
                <Text
                  variant="title"
                  style={{ fontFamily: ITALIC_SERIF }}
                  className="text-ink-primary dark:text-ink-primaryDark"
                >
                  Not in a Fit yet.
                </Text>
                <Text variant="body" className="text-ink-secondary dark:text-ink-secondaryDark">
                  Put it on the canvas with a few other pieces and save the look.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
