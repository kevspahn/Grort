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
      return JSON.parse(match[1]);
    }

    if (
      NOT_RECEIPT_PATTERNS.some((pattern) => pattern.test(trimmed))
      || isNonReceiptNarrative(trimmed)
    ) {
      throw new ReceiptParseError('Image does not appear to be a grocery receipt');
    }

    throw new Error(`Failed to parse AI response as JSON: ${trimmed.substring(0, 200)}`);
  }
}
