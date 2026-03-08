import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';
import { parseReceiptJsonResponse } from './parseResponse';

export class GeminiReceiptParser implements ReceiptParser {
  readonly providerName = 'gemini';
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    const response = await fetch(accessibleUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      { text: RECEIPT_PARSING_PROMPT },
    ]);

    const content = result.response.text();
    if (!content) {
      throw new Error('Gemini returned no content');
    }

    const parsed = parseReceiptJsonResponse(content);

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
