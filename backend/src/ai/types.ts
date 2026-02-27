import { ReceiptExtractionResult } from '../shared/schemas';

export interface ReceiptParser {
  parse(imageUrl: string): Promise<ReceiptExtractionResult>;
  readonly providerName: string;
}
