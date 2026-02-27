import { productRepository, ProductRow } from '../repositories/productRepository';

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalized similarity (0-1, where 1 is identical).
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

export interface MatchResult {
  product: ProductRow | null;
  confidence: 'exact' | 'near' | 'new';
  score: number;
}

const EXACT_THRESHOLD = 0.9;
const NEAR_THRESHOLD = 0.6;

export const productMatchService = {
  async matchProduct(
    householdId: string,
    suggestedCanonicalName: string | null,
    nameOnReceipt: string
  ): Promise<MatchResult> {
    if (!suggestedCanonicalName) {
      return { product: null, confidence: 'new', score: 0 };
    }

    const products = await productRepository.findAllByHousehold(householdId);

    let bestMatch: ProductRow | null = null;
    let bestScore = 0;

    for (const product of products) {
      // Compare against canonical name
      const canonicalScore = similarity(suggestedCanonicalName, product.canonical_name);
      // Also compare against receipt name for good measure
      const receiptScore = similarity(nameOnReceipt, product.canonical_name);
      const score = Math.max(canonicalScore, receiptScore);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    if (bestScore >= EXACT_THRESHOLD && bestMatch) {
      return { product: bestMatch, confidence: 'exact', score: bestScore };
    }

    if (bestScore >= NEAR_THRESHOLD && bestMatch) {
      return { product: bestMatch, confidence: 'near', score: bestScore };
    }

    return { product: null, confidence: 'new', score: bestScore };
  },
};
