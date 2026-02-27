import { describe, it, expect, beforeEach } from 'vitest';
import { getReceiptParser, resetParserCache } from './parserFactory';

describe('parserFactory', () => {
  beforeEach(() => {
    resetParserCache();
  });

  it('creates Claude parser', () => {
    const parser = getReceiptParser('claude');
    expect(parser.providerName).toBe('claude');
  });

  it('creates OpenAI parser', () => {
    const parser = getReceiptParser('openai');
    expect(parser.providerName).toBe('openai');
  });

  it('creates Gemini parser', () => {
    const parser = getReceiptParser('gemini');
    expect(parser.providerName).toBe('gemini');
  });

  it('throws on unknown provider', () => {
    expect(() => getReceiptParser('unknown' as any)).toThrow('Unknown AI provider');
  });
});
