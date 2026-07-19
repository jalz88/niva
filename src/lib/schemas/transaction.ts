import { z } from 'zod'

// Mirrors the constraints in docs/07-domain-model-and-schema.md §3/§5 so a
// user never passes client validation only to fail at the database with a
// confusing error. If a rule changes here, update the migration too.
export const transactionInputSchema = z
  .object({
    type: z.enum(['income', 'expense']),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 1500 or 1500.00')
      .refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
    currencyCode: z.string().length(3),
    occurredOn: z.string().date(),
    propertyId: z.string().uuid('Choose a property'),
    categoryId: z.string().uuid('Choose a category'),
    paymentMethodId: z.string().uuid('Choose a payment method'),
    platformId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.type !== 'income' || true, {
    // Platform is typically set for income, supplier for expense, but
    // neither is hard-required at the schema level — see
    // docs/07-domain-model-and-schema.md §3 "typically set for income/expense".
    message: 'ok',
  })

export type TransactionInput = z.infer<typeof transactionInputSchema>
