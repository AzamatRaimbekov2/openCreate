// Credit ledger contracts. Amounts are signed integers (charge rows are
// negative, refunds/bonuses positive) so the ledger sums to the balance —
// mirrors the ADR's hold->settle/refund semantics collapsed to charge/refund.
import { z } from 'zod'

export const creditTransactionKindSchema = z.enum(['signup_bonus', 'charge', 'refund'])
export const creditTransactionSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  kind: creditTransactionKindSchema,
  generationId: z.string().nullable(),
  createdAt: z.string(),
})
export type CreditTransaction = z.infer<typeof creditTransactionSchema>
export const creditTransactionListSchema = z.object({
  items: z.array(creditTransactionSchema),
})
