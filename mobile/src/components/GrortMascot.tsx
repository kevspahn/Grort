import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useGrortMascot } from '../hooks/useGrortMascot';
import { colors, spacing, fontSize } from '../styles/theme';

interface GrortMascotProps {
  receiptCount: number;
  size?: number;
  showTierName?: boolean;
}

export function GrortMascot({ receiptCount, size = 120, showTierName = false }: GrortMascotProps) {
  const { source, tierName } = useGrortMascot(receiptCount);

  return (
    <View style={styles.container}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
      {showTierName && <Text style={styles.tierName}>{tierName}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.xs },
  tierName: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
});
