import { z } from 'zod'

// Mirrors the constraints in docs/07-domain-model-and-schema.md §3/§5 so a
// user never passes client validation only to fail at the database with a
// confusing error. This is the *form* shape — `supplierName` is free text
// (the transaction form's supplier combo box lets you pick an existing
// name or type a new one) resolved to a supplierId via
// useSuppliers().findOrCreate() at submit time, whether the name is new or
// already exists in the Suppliers admin screen.
const optionalUuid = z
  .union([z.string().uuid(), z.literal('')])
  .optional()
  .transform((value) => (value ? value : undefined))

export const transactionFormSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 1500 or 1500.00')
    .refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
  currencyCode: z.string().length(3, 'Choose a currency'),
  occurredOn: z.string().date('Choose a date'),
  // No propertyId field — see 2026-07-20 real-user-testing feedback.
  // While there's exactly one property, TransactionForm assigns it
  // silently; a header property switcher (not yet built) will take over
  // this job the day a second property exists, without the form changing.
  categoryId: z.string().uuid('Choose a category'),
  paymentMethodId: z.string().uuid('Choose a payment method'),
  platformId: optionalUuid,
  supplierName: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
})

export type TransactionFormValues = z.infer<typeof transactionFormSchema>

// The resolved payload sent to useTransactions().create()/update() once
// supplierName has been turned into a supplierId.
export interface TransactionPayload {
  type: 'income' | 'expense'
  amount: string
  currencyCode: string
  occurredOn: string
  propertyId: string
  categoryId: string
  paymentMethodId: string
  platformId?: string
  supplierId?: string
  notes?: string
}
