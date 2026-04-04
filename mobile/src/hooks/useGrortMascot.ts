import { ImageSourcePropType } from 'react-native';

const TIERS = [
  { min: 50, source: require('../../assets/grort-v3.png'), tierName: 'Mecha Grort' },
  { min: 10, source: require('../../assets/grort-v2.png'), tierName: 'Cyber Grort' },
  { min: 0, source: require('../../assets/grort-v1.png'), tierName: 'Baby Grort' },
];

export function useGrortMascot(receiptCount: number): { source: ImageSourcePropType; tierName: string } {
  const tier = TIERS.find((t) => receiptCount >= t.min) ?? TIERS[TIERS.length - 1];
  return { source: tier.source, tierName: tier.tierName };
}
