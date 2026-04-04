import { Redirect, Slot, Tabs, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSize } from '../../src/styles/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { GrortMascot } from '../../src/components/GrortMascot';

const VISIBLE_TABS = new Set(['scan', 'receipts', 'trends', 'prices', 'profile']);

function getCurrentSegment(pathname: string) {
  return pathname.replace(/^\//, '').split('/')[0] || 'scan';
}

function WebTabBar() {
  const pathname = usePathname();
  const currentSegment = getCurrentSegment(pathname);
  const visibleRoutes = [
    { name: 'scan', label: 'Scan' },
    { name: 'receipts', label: 'Receipts' },
    { name: 'trends', label: 'Trends' },
    { name: 'prices', label: 'Prices' },
    { name: 'profile', label: 'Profile' },
  ];

  return (
    <View style={styles.webTabBar}>
      {visibleRoutes.map((route) => {
        const isFocused = currentSegment === route.name;

        return (
          <Pressable
            key={route.name}
            onPress={() => {
              if (!isFocused) {
                router.push(`/(tabs)/${route.name}` as never);
              }
            }}
            style={[styles.webTab, isFocused && styles.webTabActive]}
          >
            <Text style={[styles.webTabText, isFocused && styles.webTabTextActive]}>
              {route.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <GrortMascot receiptCount={user?.receiptCount ?? 0} size={100} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (Platform.OS === 'web') {
    const currentSegment = getCurrentSegment(pathname);
    const showTabBar = VISIBLE_TABS.has(currentSegment);

    return (
      <View style={styles.webShell}>
        <View style={styles.webContent}>
          <Slot />
        </View>
        {showTabBar ? <WebTabBar /> : null}
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
        headerShown: true,
      }}
    >
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} /> }} />
      <Tabs.Screen name="receipts" options={{ title: 'Receipts', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" size={size} color={color} /> }} />
      <Tabs.Screen name="prices" options={{ title: 'Prices', tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="receipt-review" options={{ href: null }} />
      <Tabs.Screen name="receipt-detail" options={{ href: null }} />
      <Tabs.Screen name="product-detail" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webContent: {
    flex: 1,
  },
  webTabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  webTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  webTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  webTabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  webTabTextActive: {
    color: colors.textOnPrimary,
  },
});
