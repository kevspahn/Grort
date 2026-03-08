import Anthropic from '@anthropic-ai/sdk';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';
import { parseReceiptJsonResponse } from './parseResponse';

export class ClaudeReceiptParser implements ReceiptParser {
  readonly providerName = 'claude';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    const response = await fetch(accessibleUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = response.headers.get('content-type') || 'image/jpeg';

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: RECEIPT_PARSING_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude returned no text response');
    }

    const parsed = parseReceiptJsonResponse(textContent.text);

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
