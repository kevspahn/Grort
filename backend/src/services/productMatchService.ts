import { productRepository, ProductRow } from '../repositories/productRepository';

/**
 * Normalize a product name for comparison: lowercase, strip punctuation
 * (apostrophes, ampersands, commas), collapse whitespace. So "Lund's & Byerlys"
 * and "LUNDS BYERLYS" compare equal.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    // Drop apostrophes so "Lund's" == "Lunds"; other punctuation becomes a gap.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Is the smaller token set fully contained in the larger, differing by ≤1 token? */
function subsetWithinOne(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (large.size - small.size > 1) return false;
  for (const t of small) if (!large.has(t)) return false;
  return small.size > 0;
}

export interface MatchResult {
  product: ProductRow | null;
  confidence: 'exact' | 'near' | 'new';
  score: number;
}

const NEAR_THRESHOLD = 0.6;

/**
 * Match a candidate name against a set of existing products using token-set
 * similarity (order-insensitive, punctuation-insensitive). Pure — the caller
 * supplies the product list, so a whole receipt costs one query, not N.
 */
export function matchAgainstProducts(
  products: ProductRow[],
  suggestedCanonicalName: string | null,
  nameOnReceipt: string
): MatchResult {
  const candidates = [suggestedCanonicalName, nameOnReceipt].filter(
    (c): c is string => !!c && normalizeName(c).length > 0
  );
  if (candidates.length === 0) {
    return { product: null, confidence: 'new', score: 0 };
  }

  let bestMatch: ProductRow | null = null;
  let bestScore = 0;
  let bestExact = false;
  let bestNear = false;

  for (const product of products) {
    const productTokens = tokenSet(product.canonical_name);
    const productNorm = normalizeName(product.canonical_name);

    for (const candidate of candidates) {
      const candTokens = tokenSet(candidate);
      const score = jaccard(candTokens, productTokens);
      const isExact = normalizeName(candidate) === productNorm || score === 1;
      const isNear = score >= NEAR_THRESHOLD || subsetWithinOne(candTokens, productTokens);

      // Prefer an exact hit; otherwise keep the highest-scoring candidate.
      if (isExact) {
        if (!bestExact || score > bestScore) {
          bestExact = true; bestNear = true; bestScore = Math.max(score, bestScore); bestMatch = product;
        }
      } else if (!bestExact && score > bestScore) {
        bestScore = score; bestMatch = product; bestNear = isNear;
      }
    }
  }

  if (bestExact && bestMatch) return { product: bestMatch, confidence: 'exact', score: 1 };
  if (bestNear && bestMatch) return { product: bestMatch, confidence: 'near', score: bestScore };
  return { product: null, confidence: 'new', score: bestScore };
}

export const productMatchService = {
  matchAgainstProducts,

  async matchProduct(
    householdId: string,
    suggestedCanonicalName: string | null,
    nameOnReceipt: string
  ): Promise<MatchResult> {
    if (!suggestedCanonicalName) {
      return { product: null, confidence: 'new', score: 0 };
    }
    const products = await productRepository.findAllByHousehold(householdId);
    return matchAgainstProducts(products, suggestedCanonicalName, nameOnReceipt);
  },
};
