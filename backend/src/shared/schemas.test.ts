import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  ReceiptExtractionResultSchema,
  SpendingQuerySchema,
} from './schemas';

describe('Zod schemas', () => {
  it('validates RegisterSchema', () => {
    const valid = RegisterSchema.parse({ email: 'a@b.com', password: '12345678', name: 'Test' });
    expect(valid.email).toBe('a@b.com');
  });

  it('rejects invalid RegisterSchema', () => {
    expect(() => RegisterSchema.parse({ email: 'bad', password: '1', name: '' })).toThrow();
  });

  it('validates LoginSchema', () => {
    const valid = LoginSchema.parse({ email: 'a@b.com', password: 'pass' });
    expect(valid.email).toBe('a@b.com');
  });

  it('validates ReceiptExtractionResultSchema', () => {
    const data = {
      storeName: 'Costco',
      storeAddress: '123 Main St',
      storeBrand: 'Costco',
      receiptDate: '2026-01-15',
      items: [
        {
          nameOnReceipt: 'Organic Milk',
          quantity: 1,
          unitPrice: 5.99,
          totalPrice: 5.99,
          suggestedCategory: 'Dairy',
          suggestedCanonicalName: 'Organic Whole Milk',
        },
      ],
      subtotal: 5.99,
      tax: 0,
      total: 5.99,
    };
    const result = ReceiptExtractionResultSchema.parse(data);
    expect(result.items).toHaveLength(1);
  });

  it('defaults SpendingQuery period to month', () => {
    const result = SpendingQuerySchema.parse({});
    expect(result.period).toBe('month');
    expect(result.scope).toBe('household');
  });
});
