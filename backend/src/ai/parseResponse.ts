import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';

export class ReceiptParseError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'ReceiptParseError';
    this.statusCode = statusCode;
  }
}

const NOT_RECEIPT_PATTERNS = [
  /not (?:a|an) (?:grocery )?receipt/i,
  /don't see (?:any |a )?(?:grocery )?receipt/i,
  /do not see (?:any |a )?(?:grocery )?receipt/i,
  /cannot identify (?:any |a )?(?:grocery )?receipt/i,
  /cannot identify any (?:grocery )?receipt content/i,
  /rather than a receipt/i,
  /logo or icon rather than a receipt/i,
  /does not appear to be a receipt/i,
  /no receipt text/i,
  /no visible text/i,
];

const NOT_RECEIPT_HINTS = [
  /logo/i,
  /icon/i,
  /graphic/i,
  /design/i,
  /geometric/i,
  /no text/i,
  /no visible text/i,
  /receipt content/i,
];

function isNonReceiptNarrative(content: string) {
  return /receipt/i.test(content) && NOT_RECEIPT_HINTS.some((pattern) => pattern.test(content));
}

export function parseReceiptJsonResponse(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        throw new ReceiptParseError('AI returned a malformed JSON code block');
      }
    }

    if (
      NOT_RECEIPT_PATTERNS.some((pattern) => pattern.test(trimmed))
      || isNonReceiptNarrative(trimmed)
    ) {
      throw new ReceiptParseError('Image does not appear to be a grocery receipt');
    }

    throw new ReceiptParseError('Could not read a receipt from this image');
  }
}

/**
 * Drop-and-flag malformed items, then validate. A single unusable item (no
 * name, non-numeric price) is dropped rather than rejecting the whole receipt.
 * Throws ReceiptParseError if nothing usable remains.
 */
export function sanitizeExtraction(raw: unknown): ReceiptExtractionResult {
  const obj: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};

  if (Array.isArray(obj.items)) {
    obj.items = obj.items.filter((it) => {
      if (!it || typeof it !== 'object') return false;
      const item = it as Record<string, unknown>;
      const name = typeof item.nameOnReceipt === 'string' ? item.nameOnReceipt.trim() : '';
      const total =
        typeof item.totalPrice === 'number'
          ? item.totalPrice
          : typeof item.totalPrice === 'string'
            ? Number(item.totalPrice)
            : NaN;
      if (!name || !Number.isFinite(total)) return false;
      item.totalPrice = total;
      return true;
    });
    if ((obj.items as unknown[]).length === 0) {
      throw new ReceiptParseError('No line items could be read from this receipt');
    }
  }

  try {
    return ReceiptExtractionResultSchema.parse(obj);
  } catch {
    throw new ReceiptParseError('Receipt data could not be understood');
  }
}
