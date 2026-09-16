import { ActivityIndicator, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, Tabs, router } from 'expo-router';

import { AddItemTabButton } from '@/components/navigation/AddItemTabButton';
import { TabBarButton } from '@/components/navigation/TabBarButton';
import { PillGlassBackground } from '@/components/navigation/PillGlassBackground';
import { AnimatedActiveIndicator } from '@/components/navigation/AnimatedActiveIndicator';
import { HomeIcon } from '@/components/ui/icons/HomeIcon';
import { HangerIcon } from '@/components/ui/icons/HangerIcon';
import { ShirtIcon } from '@/components/ui/icons/ShirtIcon';
import { CalendarIcon } from '@/components/ui/icons/CalendarIcon';
import { colors } from '@/lib/theme/colors';
import { TAB_BAR_HEIGHT } from '@/lib/theme/tabBar';
import { useSession } from '@/lib/auth/useSession';

const PILL_MARGIN = 16;
const ITEM_INSET = 6;

/**
 * Hand-drawn thin-stroke icons (react-native-svg, already a dependency --
 * no icon package installed) above a text label for the four real
 * destinations, matching DESIGN.md's "thin-stroke icons, one family
 * throughout" even without Phosphor itself. The middle slot is the one
 * exception -- an accent-filled icon-only "Add item" action, not a
 * destination. Profile isn't a tab at all -- it's reached from an icon on
 * Home instead (a top-level pushed route, `app/profile.tsx`), freeing this
 * slot back to "Fits."
 *
 * `position: 'absolute'` -- required for the frosted-glass background
 * (`PillGlassBackground`) to have real screen content behind it to blur.
 * With the earlier `position: 'relative'`, screens stopped above the bar
 * and nothing ever rendered underneath it, making the blur invisible no
 * matter what. The tradeoff: screens now render full-height behind the
 * bar, so any scrollable one needs its own bottom clearance -- see
 * `useTabBarClearance()` in `lib/theme/tabBar.ts` (used by Wardrobe's grid).
 */
export default function TabsLayout() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const barWidth = width - PILL_MARGIN * 2;
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        <ActivityIndicator />
      </View>
    );
  }

  // A session can go null while a tab is mounted — expiry, or being signed
  // out remotely — not just at cold start (which app/index.tsx already
  // guards). Without this, an authenticated screen like Profile is left
  // rendering against no user with no way back to Welcome.
  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.inkPrimary,
        tabBarInactiveTintColor: palette.inkSecondary,
        // No per-item `tabBarActiveBackgroundColor` -- that's a static,
        // instant on/off toggle per tab, which can't slide or morph between
        // positions. `AnimatedActiveIndicator` (a single shared element)
        // replaces it entirely; see its own doc comment.
        tabBarBackground: () => (
          <>
            <PillGlassBackground radius={TAB_BAR_HEIGHT / 2} />
            <AnimatedActiveIndicator barWidth={barWidth} barHeight={TAB_BAR_HEIGHT} inset={ITEM_INSET} />
          </>
        ),
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: TAB_BAR_HEIGHT,
          // The bar's own bottom safe-area padding is turned off (0) because
          // `marginBottom` below already lifts the whole pill clear of the
          // home indicator -- without this override, expo-router's default
          // `paddingBottom: insets.bottom` stacks on top of that margin and
          // squeezes the pill's content up into its top half.
          paddingBottom: 0,
          marginHorizontal: PILL_MARGIN,
          marginBottom: Math.max(insets.bottom - 16, 8),
          borderRadius: TAB_BAR_HEIGHT / 2,
          borderTopWidth: 0,
          // Transparent -- `tabBarBackground` (the frosted-glass `View`)
          // paints the actual fill. This outer style still carries the
          // shadow, deliberately kept un-clipped (no `overflow: 'hidden'`
          // here) so it isn't cut off along with the blur.
          backgroundColor: 'transparent',
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarButton: (props) => (
            <TabBarButton
              label="Home"
              renderIcon={(color) => <HomeIcon size={24} color={color} />}
              focused={props['aria-selected']}
              onPress={props.onPress}
              style={props.style}
              accessibilityLabel={props['aria-label']}
              testID={props.testID}
            />
          ),
        }}
      />
      {/* Route/data naming stays "wardrobe" -- only this tab's visible label reads "Closet". */}
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Closet',
          tabBarButton: (props) => (
            <TabBarButton
              label="Closet"
              renderIcon={(color) => <HangerIcon size={24} color={color} />}
              focused={props['aria-selected']}
              onPress={props.onPress}
              style={props.style}
              accessibilityLabel={props['aria-label']}
              testID={props.testID}
            />
          ),
        }}
      />
      {/*
        The middle slot is the "Add item" action, not a real screen --
        `add.tsx` only exists so this route resolves; its tab press always
        redirects to `/add-item` before it would ever mount.
      */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarButton: (props) => <AddItemTabButton onPress={props.onPress} style={props.style} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/add-item');
          },
        }}
      />
      <Tabs.Screen
        name="fits"
        options={{
          title: 'Fits',
          tabBarButton: (props) => (
            <TabBarButton
              label="Fits"
              renderIcon={(color) => <ShirtIcon size={24} color={color} />}
              focused={props['aria-selected']}
              onPress={props.onPress}
              style={props.style}
              accessibilityLabel={props['aria-label']}
              testID={props.testID}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          tabBarButton: (props) => (
            <TabBarButton
              label="Planner"
              renderIcon={(color) => <CalendarIcon size={24} color={color} />}
              focused={props['aria-selected']}
              onPress={props.onPress}
              style={props.style}
              accessibilityLabel={props['aria-label']}
              testID={props.testID}
            />
          ),
        }}
      />
    </Tabs>
  );
}
