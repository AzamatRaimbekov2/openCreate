// apps/web/src/modules/Analytics/model/format.ts
// Presentation of numbers that are allowed to be UNKNOWN.
//
// Every function here takes `number | null` and renders null as an em-dash, not
// as "0". That is the whole point of the ADR's §4: a margin of zero invites a
// pricing decision and a margin of unknown forbids one, so they must never look
// alike on screen. Centralised so a component cannot accidentally `?? 0` its way
// past the distinction.
const DASH = '—'

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return DASH
  return `${(value * 100).toFixed(digits)}%`
}

// The API already returns marginPercent as a percentage (75, not 0.75).
export function formatPercentPoints(value: number | null, digits = 1): string {
  if (value === null) return DASH
  return `${value.toFixed(digits)}%`
}

export function formatUsd(value: number | null): string {
  if (value === null) return DASH
  const sign = value < 0 ? '−' : ''
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

export function formatInt(value: number | null): string {
  if (value === null) return DASH
  return value.toLocaleString('en-US')
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return DASH
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 90) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

// Health colour. `null` is NOT a failure — it is an idle model, and painting it
// red is how an operator learns to ignore the colour entirely.
export type HealthTone = 'good' | 'warn' | 'bad' | 'idle'

export function healthTone(successRate: number | null): HealthTone {
  if (successRate === null) return 'idle'
  if (successRate >= 0.9) return 'good'
  if (successRate >= 0.6) return 'warn'
  return 'bad'
}
