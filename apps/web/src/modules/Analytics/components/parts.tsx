// apps/web/src/modules/Analytics/components/parts.tsx
// The three primitives every analytics panel is built from. Local to this module
// on purpose: they encode ANALYTICS semantics (an unknown value is an em-dash, a
// bar chart with no data is not an empty chart), which is not something the
// shared kit should have an opinion about.
import type { ReactNode } from 'react'
import { Card } from 'shared/ui'
import type { HealthTone } from '../model/format'

const TONE_TEXT: Record<HealthTone, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  // Idle reads as ordinary body text, NOT as a warning colour. A model nobody
  // used today is not a problem, and colouring it like one teaches the operator
  // to stop trusting the colours (format.ts healthTone).
  idle: 'text-mist-dim',
}

export type StatProps = {
  label: string
  // Already formatted — the caller owns the em-dash-for-unknown decision.
  value: string
  // `| undefined` explicitly: exactOptionalPropertyTypes is on, and callers pass
  // a conditional hint that is genuinely absent rather than omitted.
  hint?: string | undefined
  tone?: HealthTone | undefined
}

export function Stat({ label, value, hint, tone }: StatProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-mist-dim">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${tone ? TONE_TEXT[tone] : 'text-white'}`}>
        {value}
      </span>
      {hint ? <span className="text-xs text-mist-dim">{hint}</span> : null}
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{children}</div>
}

export type BarDatum = { label: string; value: number; caption?: string }

// A deliberately plain bar chart: no library, no axes, no tooltip. The numbers
// are printed next to the bars, so the bars only carry SHAPE — which day was
// busy — and the page stays readable if CSS never loads.
export function MiniBars({ data, format }: { data: BarDatum[]; format: (n: number) => string }) {
  // Guard the divide, not the render: an all-zero window is a real, meaningful
  // answer ("nothing happened"), so it draws empty bars rather than an error.
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3 text-xs">
          <span className="w-20 shrink-0 text-mist-dim tabular-nums">{d.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
            <span
              className="block h-full rounded-full bg-cyan-400/70"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums text-white">{format(d.value)}</span>
          {d.caption ? <span className="w-20 shrink-0 text-right text-mist-dim">{d.caption}</span> : null}
        </li>
      ))}
    </ul>
  )
}

// A table that keeps its header when it has no rows, so "no failures in this
// window" and "this panel is broken" never look the same.
export function DataTable({
  headers,
  rows,
  emptyLabel,
  title,
  action,
}: {
  headers: string[]
  // Each row carries its OWN key — a model id, a date, a user id. Deriving one
  // from the cells would mean stringifying ReactNodes, and falling back to the
  // array index would make React reuse the wrong row when the table re-sorts,
  // which it does on every window change.
  rows: { key: string; cells: ReactNode[] }[]
  emptyLabel: string
  title: string
  action?: ReactNode
}) {
  return (
    <Card title={title} action={action} padding="md">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-mist-dim">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-mist-dim">
                {headers.map((h) => (
                  <th key={h} className="py-2 pr-4 font-medium last:pr-0 last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-white/5 last:border-0">
                  {row.cells.map((cell, ci) => (
                    <td
                      key={headers[ci] ?? ci}
                      className="py-2 pr-4 tabular-nums last:pr-0 last:text-right"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
