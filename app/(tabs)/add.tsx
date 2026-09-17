import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

/**
 * Never actually seen -- the tab bar's "+" button intercepts its own
 * `tabPress` (see `(tabs)/_layout.tsx`) and redirects to `/add-item` before
 * this screen would mount. This is only a fallback for the unlikely case of
 * a direct deep link into this route.
 */
export default function AddTabFallback() {
  useEffect(() => {
    router.replace('/add-item');
  }, []);

  return <View className="flex-1 bg-surface-base dark:bg-surface-baseDark" />;
}
