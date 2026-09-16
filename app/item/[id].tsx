import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { CategoryPicker } from '@/components/wardrobe/CategoryPicker';
import { ColorSwatchPicker, colorLabel } from '@/components/wardrobe/ColorSwatchPicker';
import { SectionLabel } from '@/components/wardrobe/SectionLabel';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
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

const GUTTER = 16;

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const cutoutSize = width - GUTTER * 2;

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
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        {header}
        <ActivityIndicator />
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

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      <ScrollView contentContainerClassName="px-gutter pb-10">
        <View style={{ width: cutoutSize, height: cutoutSize }} className="mb-12 self-center">
          {cutoutUrl ? (
            <Image
              testID="item-detail-cutout"
              accessibilityLabel="Item photo"
              source={{ uri: cutoutUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : (
            <View
              testID="item-detail-cutout-fallback"
              className="h-full w-full rounded-sm bg-surface-raised dark:bg-surface-raisedDark"
            />
          )}
        </View>

        {errorMessage ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}

        {isEditing ? (
          <View>
            <SectionLabel>Category</SectionLabel>
            <CategoryPicker value={editCategory} onChange={setEditCategory} />

            <View className="mt-5">
              <SectionLabel>Color</SectionLabel>
            </View>
            <ColorSwatchPicker value={editColorHex} onChange={setEditColorHex} />

            <View className="mt-5">
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Name (optional)"
                accessibilityLabel="Item name"
                className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
              />
              <TextInput
                value={editBrand}
                onChangeText={setEditBrand}
                placeholder="Brand (optional)"
                accessibilityLabel="Item brand"
                className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
              />
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Notes (optional)"
                multiline
                accessibilityLabel="Item notes"
                className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
              />
            </View>

            <View className="mb-2">
              <Button title="Save" variant="primary" loading={saving} onPress={handleSave} />
            </View>
            <Button title="Cancel" onPress={handleCancelEdit} disabled={saving} />
          </View>
        ) : (
          <View>
            <Text variant="display" className="mb-2 text-accent dark:text-accentDark">
              {item.name?.trim() || CATEGORY_LABELS[item.category]}
            </Text>
            <Text variant="meta" className="mb-9 uppercase tracking-widest text-ink-secondary dark:text-ink-secondaryDark">
              {[
                item.name ? CATEGORY_LABELS[item.category] : null,
                colorLabel(item.color_hex) ?? 'No color set',
                item.brand,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>

            {item.notes ? (
              <Text variant="body" className="mb-8 text-ink-primary dark:text-ink-primaryDark">
                {item.notes}
              </Text>
            ) : null}

            <SectionLabel>Fits</SectionLabel>
            <Text variant="body" className="mb-6 text-ink-secondary dark:text-ink-secondaryDark">
              Not in any Fit yet.
            </Text>

            <View className="mb-6 flex-row items-stretch gap-3 border-t border-border-hairline pt-6 dark:border-border-hairlineDark">
              <Button title="Edit" onPress={handleStartEdit} disabled={deleting} />
              <View className="flex-1">
                <Button title="Create Fit With This" disabled />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete item"
              onPress={handleDeletePress}
              disabled={deleting}
              className="items-center py-2"
            >
              <Text variant="label" className="uppercase tracking-widest text-destructive dark:text-destructiveDark">
                {deleting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
