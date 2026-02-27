import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/styles/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
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
