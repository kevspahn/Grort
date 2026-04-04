import { z } from 'zod';

// ---- Auth ----
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1),
  googleId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(100),
});
export type GoogleAuthInput = z.infer<typeof GoogleAuthSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    householdId: z.string().uuid().nullable(),
    householdRole: z.enum(['owner', 'member']).nullable(),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ---- Household ----
export const CreateHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().email(),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const HouseholdMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['owner', 'member']),
});
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

// ---- Store ----
export const StoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  address: z.string().nullable(),
  householdId: z.string().uuid(),
  createdAt: z.string(),
});
export type Store = z.infer<typeof StoreSchema>;

export const UpdateStoreSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullable().optional(),
});
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

export const MergeStoresSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
export type MergeStoresInput = z.infer<typeof MergeStoresSchema>;

// ---- Category ----
export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
});
export type Category = z.infer<typeof CategorySchema>;

// ---- Product ----
export const ProductSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  canonicalName: z.string(),
  categoryId: z.string().uuid().nullable(),
  createdAt: z.string(),
  latestPrice: z.number().nullable().optional(),
  purchaseCount: z.number().optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const UpdateProductSchema = z.object({
  canonicalName: z.string().min(1).max(300).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const MergeProductsSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
export type MergeProductsInput = z.infer<typeof MergeProductsSchema>;

// ---- Receipt Item (AI extraction) ----
export const ExtractedItemSchema = z.object({
  nameOnReceipt: z.string(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nullable(),
  totalPrice: z.number(),
  suggestedCategory: z.string().nullable(),
  suggestedCanonicalName: z.string().nullable(),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

// ---- AI Extraction Result ----
export const ReceiptExtractionResultSchema = z.object({
  storeName: z.string().nullable().default(null),
  storeAddress: z.string().nullable(),
  storeBrand: z.string().nullable(),
  receiptDate: z.string(), // YYYY-MM-DD
  items: z.array(ExtractedItemSchema).min(1),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
});
export type ReceiptExtractionResult = z.infer<typeof ReceiptExtractionResultSchema>;

// ---- Receipt ----
export const ReceiptItemSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  nameOnReceipt: z.string(),
  quantity: z.number(),
  unitPrice: z.number().nullable(),
  totalPrice: z.number(),
  categoryId: z.string().uuid().nullable(),
  createdAt: z.string(),
  // Joined fields
  productName: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  matchConfidence: z.enum(['exact', 'near', 'new']).optional(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  householdId: z.string().uuid().nullable(),
  storeId: z.string().uuid(),
  receiptDate: z.string(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
  imageUrl: z.string(),
  createdAt: z.string(),
  // Joined fields
  storeName: z.string().optional(),
  itemCount: z.number().optional(),
  items: z.array(ReceiptItemSchema).optional(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const UpdateReceiptItemSchema = z.object({
  nameOnReceipt: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nullable().optional(),
  totalPrice: z.number().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
});
export type UpdateReceiptItemInput = z.infer<typeof UpdateReceiptItemSchema>;

// ---- Analytics ----
export const SpendingQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('month'),
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(),
  scope: z.enum(['personal', 'household']).default('household'),
});
export type SpendingQuery = z.infer<typeof SpendingQuerySchema>;

export const SpendingResultSchema = z.object({
  totalSpent: z.number(),
  periodBreakdown: z.array(z.object({
    period: z.string(),
    total: z.number(),
  })),
  categoryBreakdown: z.array(z.object({
    categoryId: z.string().uuid().nullable(),
    categoryName: z.string(),
    total: z.number(),
    percentage: z.number(),
  })),
});
export type SpendingResult = z.infer<typeof SpendingResultSchema>;

export const PriceHistoryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;

export const PriceHistoryResultSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  dataPoints: z.array(z.object({
    date: z.string(),
    price: z.number(),
    storeId: z.string().uuid(),
    storeName: z.string(),
  })),
});
export type PriceHistoryResult = z.infer<typeof PriceHistoryResultSchema>;

export const StoreComparisonQuerySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
});
export type StoreComparisonQuery = z.infer<typeof StoreComparisonQuerySchema>;

export const StoreComparisonResultSchema = z.object({
  comparisons: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    stores: z.array(z.object({
      storeId: z.string().uuid(),
      storeName: z.string(),
      avgPrice: z.number(),
      minPrice: z.number(),
      maxPrice: z.number(),
      dataPoints: z.number(),
    })),
    cheapestStoreId: z.string().uuid(),
  })),
});
export type StoreComparisonResult = z.infer<typeof StoreComparisonResultSchema>;

// ---- Pagination ----
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

// ---- Receipts list query ----
export const ReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  storeId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ReceiptsQuery = z.infer<typeof ReceiptsQuerySchema>;
