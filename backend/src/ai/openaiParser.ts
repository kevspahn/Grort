import OpenAI from 'openai';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';

export class OpenAIReceiptParser implements ReceiptParser {
  readonly providerName = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'not-set',
    });
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: accessibleUrl },
            },
            {
              type: 'text',
              text: RECEIPT_PARSING_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned no content');
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
