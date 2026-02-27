import { ReceiptParser } from './types';
import { ClaudeReceiptParser } from './claudeParser';
import { OpenAIReceiptParser } from './openaiParser';
import { GeminiReceiptParser } from './geminiParser';

export type AIProvider = 'claude' | 'openai' | 'gemini';

const parsers: Record<AIProvider, () => ReceiptParser> = {
  claude: () => new ClaudeReceiptParser(),
  openai: () => new OpenAIReceiptParser(),
  gemini: () => new GeminiReceiptParser(),
};

let cachedParser: ReceiptParser | null = null;
let cachedProvider: AIProvider | null = null;

export function getReceiptParser(provider?: AIProvider): ReceiptParser {
  const activeProvider = provider || (process.env.AI_PROVIDER as AIProvider) || 'claude';

  if (cachedParser && cachedProvider === activeProvider) {
    return cachedParser;
  }

  const factory = parsers[activeProvider];
  if (!factory) {
    throw new Error(`Unknown AI provider: ${activeProvider}. Supported: ${Object.keys(parsers).join(', ')}`);
  }

  cachedParser = factory();
  cachedProvider = activeProvider;
  return cachedParser;
}

export function resetParserCache(): void {
  cachedParser = null;
  cachedProvider = null;
}
