// Analytics wire contracts (ADR: docs/wiki/decisions/analytics.md).
//
// Two audiences, deliberately two different shapes. The admin shapes carry
// provider USD and margin; the personal shape carries CREDITS ONLY and has no
// field that could hold our cost basis — a user must not learn what we pay
// providers, and the cheapest way to guarantee that is a schema with nowhere to
// put it (ADR §6).
//
// Every "rate" and "money" field here is nullable on purpose. A success rate over
// zero generations is not 0%, it is unknown; a margin without a credit price is
// not $0, it is unknown. Rendering either as a number invites a decision the data
// does not support, so the wire type forces the UI to handle the gap (ADR §4).
import { z } from 'zod'

// Every analytics read is windowed. 1..365 days: below 1 is meaningless and above
// a year is a table scan nobody asked for on a SQLite file with one writer.
export const analyticsWindowSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
})
export type AnalyticsWindow = z.infer<typeof analyticsWindowSchema>

export const ANALYTICS_DEFAULT_DAYS = 7
// A generation still 'processing' after this long is not slow, it is stranded —
// the stale reaper's own threshold, reused so the dashboard and the reaper cannot
// disagree about what "stuck" means.
export const STUCK_AFTER_MINUTES = 60

// ─── Health ──────────────────────────────────────────────────────────────────

export const outcomeCountsSchema = z.object({
  total: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  processing: z.number().int().min(0),
  // null when nothing SETTLED in the window. Zero settled generations is not a
  // 0% success rate, and a red "0%" on an idle day is a false alarm.
  successRate: z.number().min(0).max(1).nullable(),
})
export type OutcomeCounts = z.infer<typeof outcomeCountsSchema>

export const modelHealthSchema = outcomeCountsSchema.extend({
  modelId: z.string(),
  provider: z.string(),
  type: z.string(),
  // Median, not mean: one stuck 40-minute job drags a mean into uselessness while
  // the median still describes what a user actually waits. null when nothing
  // settled with both timestamps.
  medianDurationMs: z.number().int().min(0).nullable(),
})
export type ModelHealth = z.infer<typeof modelHealthSchema>

export const failureSampleSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  provider: z.string(),
  type: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
})
export type FailureSample = z.infer<typeof failureSampleSchema>

export const stuckJobSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  provider: z.string(),
  ageMinutes: z.number().int().min(0),
})
export type StuckJob = z.infer<typeof stuckJobSchema>

export const adminHealthSchema = z.object({
  windowDays: z.number().int().min(1),
  generations: outcomeCountsSchema,
  filmRenders: outcomeCountsSchema,
  modelRenders: outcomeCountsSchema,
  byModel: z.array(modelHealthSchema),
  // Newest first, capped server-side. A dashboard needs the shape of the failure,
  // not every instance of it.
  recentFailures: z.array(failureSampleSchema),
  // Charged but never settled. These are the rows where a refund may be owed, so
  // they lead the health panel rather than hiding under a success rate.
  stuck: z.array(stuckJobSchema),
})
export type AdminHealth = z.infer<typeof adminHealthSchema>

// ─── Money ───────────────────────────────────────────────────────────────────

// Why `billedUsd` and `unpricedCount` are siblings and never summed: Segmind
// reports no billed figure, and its adapter refuses to invent one (ADR §3). The
// pair says "this much, measured, across this many of these rows" — one number
// alone would look complete while being short by whatever Segmind cost.
export const costBreakdownSchema = z.object({
  billedUsd: z.number().min(0),
  pricedCount: z.number().int().min(0),
  unpricedCount: z.number().int().min(0),
})
export type CostBreakdown = z.infer<typeof costBreakdownSchema>

export const modelSpendSchema = costBreakdownSchema.extend({
  modelId: z.string(),
  provider: z.string(),
  count: z.number().int().min(0),
  // Net of refunds: a model that fails half its jobs must not look profitable.
  creditsNet: z.number().int(),
})
export type ModelSpend = z.infer<typeof modelSpendSchema>

export const daySpendSchema = costBreakdownSchema.extend({
  // ISO date, UTC. The API never guesses the operator's timezone.
  date: z.string(),
  creditsNet: z.number().int(),
  generations: z.number().int().min(0),
})
export type DaySpend = z.infer<typeof daySpendSchema>

// The margin block is a UNION-ish shape by nullability, not an optional add-on.
// `creditPriceUsd: null` ⇒ every derived figure is null, and the UI must say "not
// configured" rather than render a zero (ADR §4).
export const marginSchema = z.object({
  creditPriceUsd: z.number().positive().nullable(),
  revenueUsd: z.number().nullable(),
  marginUsd: z.number().nullable(),
  // margin ÷ revenue. null when revenue is unknown OR zero — dividing by an idle
  // day yields Infinity, which JSON cannot even carry.
  marginPercent: z.number().nullable(),
})
export type Margin = z.infer<typeof marginSchema>

export const adminMoneySchema = z.object({
  windowDays: z.number().int().min(1),
  creditsCharged: z.number().int().min(0),
  creditsRefunded: z.number().int().min(0),
  creditsNet: z.number().int(),
  cost: costBreakdownSchema,
  margin: marginSchema,
  byModel: z.array(modelSpendSchema),
  byDay: z.array(daySpendSchema),
})
export type AdminMoney = z.infer<typeof adminMoneySchema>

// ─── Users & volume ──────────────────────────────────────────────────────────

export const dayVolumeSchema = z.object({
  date: z.string(),
  signups: z.number().int().min(0),
  activeUsers: z.number().int().min(0),
  generations: z.number().int().min(0),
})
export type DayVolume = z.infer<typeof dayVolumeSchema>

export const surfaceVolumeSchema = z.object({
  // 'image' | 'video' | 'audio' | 'model3d' | 'film_render' | 'model_render'.
  // A plain string, not an enum: generation.type is TEXT in SQLite and a legacy
  // row with an unexpected value must show up in the dashboard, not fail its
  // parse (the same reasoning the schema's own type column carries).
  surface: z.string(),
  count: z.number().int().min(0),
})
export type SurfaceVolume = z.infer<typeof surfaceVolumeSchema>

export const topUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  generations: z.number().int().min(0),
  creditsNet: z.number().int(),
})
export type TopUser = z.infer<typeof topUserSchema>

export const adminUsersSchema = z.object({
  windowDays: z.number().int().min(1),
  // All-time, not windowed — "how many users exist" is not a rate.
  totalUsers: z.number().int().min(0),
  newUsers: z.number().int().min(0),
  // Distinct users who generated something in the window. Sign-ins are not
  // tracked, so this measures USE, which is the more honest number anyway.
  activeUsers: z.number().int().min(0),
  byDay: z.array(dayVolumeSchema),
  bySurface: z.array(surfaceVolumeSchema),
  topUsers: z.array(topUserSchema),
})
export type AdminUsers = z.infer<typeof adminUsersSchema>

// ─── Personal usage ──────────────────────────────────────────────────────────

export const usageTypeSchema = outcomeCountsSchema.extend({
  type: z.string(),
  creditsNet: z.number().int(),
})
export type UsageType = z.infer<typeof usageTypeSchema>

export const usageDaySchema = z.object({
  date: z.string(),
  generations: z.number().int().min(0),
  creditsNet: z.number().int(),
})
export type UsageDay = z.infer<typeof usageDaySchema>

// No provider cost, no margin, no billed USD — see the file header.
export const meUsageSchema = z.object({
  windowDays: z.number().int().min(1),
  creditsSpent: z.number().int().min(0),
  creditsRefunded: z.number().int().min(0),
  creditsNet: z.number().int(),
  balance: z.number().int(),
  generations: outcomeCountsSchema,
  byType: z.array(usageTypeSchema),
  byDay: z.array(usageDaySchema),
})
export type MeUsage = z.infer<typeof meUsageSchema>
