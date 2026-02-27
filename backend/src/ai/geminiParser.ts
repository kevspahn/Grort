import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
      }
    }

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
