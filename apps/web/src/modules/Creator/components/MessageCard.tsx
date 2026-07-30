// apps/web/src/modules/Creator/components/MessageCard.tsx
// One transcript entry, rendered by `content.kind`. The whole agent story is a
// list of these, so each shape has exactly one job:
//   text   — a bubble (the user's, right-aligned steel) or the agent's prose
//   step   — an executed tool: what it did, whether it worked, what it cost
//   plan   — THE BUDGET GATE: itemized charges + total + the one confirm button
//   result — the closing card, with links to the artifacts that now exist
//
// The card is presentational: it never fetches, never polls, and never decides
// whether its confirm button is live (see model/planState.ts — only the chat can
// know that). It reports a click and lets the caller spend.
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { CreatorMessage } from '@opencreate/contracts'
import { Badge, Button, Card, STEEL_SURFACE } from 'shared/ui'
import { agentTextKey } from '../model/agentCopy'
import type { PlanState } from '../model/planState'

export type MessageCardProps = {
  // The transcript entry to render, exactly as the server ordered it
  message: CreatorMessage
  // Whether THIS plan card is the live gate. Computed by CreatorChat over the
  // whole transcript; irrelevant for the other three kinds.
  planState: PlanState
  // Fires the confirm mutation. Only the plan card calls it.
  onConfirm: () => void
  // True while a confirm is in flight — the button must not fire twice
  isConfirming: boolean
}

export function MessageCard({ message, planState, onConfirm, isConfirming }: MessageCardProps) {
  const { t } = useTranslation()
  const { content } = message

  if (content.kind === 'text') {
    // The user's own words: a compact steel bubble on the right, so the eye can
    // find "what did I ask?" while scrolling a long agent monologue.
    if (message.role === 'user') {
      return (
        <li className="flex justify-end">
          <p
            className={`max-w-[80%] rounded-2xl border px-4 py-2.5 text-sm whitespace-pre-wrap text-mist ${STEEL_SURFACE}`}
          >
            {content.text}
          </p>
        </li>
      )
    }
    // A sanitized SERVER failure sentence is swapped for localized copy (see
    // model/agentCopy.ts) and rendered as a CALM amber notice — nothing the user
    // did is wrong, the agent's backend is simply off. Amber, not red, per the
    // error-UX rule; role=status so a screen reader hears it without a jolt.
    const serverKey = agentTextKey(content.text)
    if (serverKey !== null) {
      return (
        <li>
          <p role="status" className="max-w-[80ch] text-sm text-glow-amber">
            {t(serverKey)}
          </p>
        </li>
      )
    }
    return (
      <li>
        <p className="max-w-[80ch] text-sm whitespace-pre-wrap text-mist">{content.text}</p>
      </li>
    )
  }

  if (content.kind === 'step') {
    const failed = content.status === 'error'
    return (
      <li>
        <div className="flex items-start gap-2.5">
          <StepGlyph tool={content.tool} failed={failed} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-mist">{content.title}</span>
              {/* The WORD carries the status; the glow only reinforces it */}
              <Badge variant={failed ? 'danger' : 'success'}>
                {t(failed ? 'creator.step.error' : 'creator.step.done')}
              </Badge>
              {/* `undefined` means "free step, nothing to say"; 0 is a real
                  price and still prints, so a 0-credit run is not hidden. */}
              {content.costCredits !== undefined ? (
                <Badge>{t('creator.step.cost', { credits: content.costCredits })}</Badge>
              ) : null}
            </div>
            {/* The tool's own detail line: a quiet secondary caption, never the
                leading copy (design.md §9 — raw text may follow, never lead). */}
            {content.detail !== undefined ? (
              <span className="text-xs text-mist-dim">{content.detail}</span>
            ) : null}
            <ArtifactLinks canvasId={content.canvasId} entityId={content.entityId} />
          </div>
        </div>
      </li>
    )
  }

  if (content.kind === 'plan') {
    return (
      <li>
        <Card title={t('creator.plan.title')} surface="steel">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-mist">{content.summary}</p>
            <p className="text-xs text-mist-dim">{t('creator.plan.lead')}</p>
            {/* Itemized so the total is auditable — a single number the user
                cannot break down is not a budget, it is a demand. */}
            <ul className="flex flex-col gap-1.5">
              {content.items.map((item) => (
                <li
                  key={`${item.label}-${item.credits}`}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span className="min-w-0 text-mist">{item.label}</span>
                  <span className="shrink-0 text-mist-dim">
                    {t('creator.step.cost', { credits: item.credits })}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-2.5 text-sm">
              <span className="text-mist-dim">{t('creator.plan.total')}</span>
              <span className="text-white">
                {t('creator.step.cost', { credits: content.totalCredits })}
              </span>
            </div>
            {/* A plan that died unanswered says so and points at the way out; an
                answered one stays silent because the messages below it already
                tell the story (planState.ts explains why we cannot claim more). */}
            {planState === 'stale' ? (
              <p role="status" className="text-xs text-glow-amber">
                {t('creator.plan.stale')}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={onConfirm}
                disabled={planState !== 'live'}
                isLoading={isConfirming}
              >
                {t('creator.plan.confirm', { credits: content.totalCredits })}
              </Button>
            </div>
          </div>
        </Card>
      </li>
    )
  }

  return (
    <li>
      <Card surface="steel">
        <div className="flex flex-col gap-3">
          <p className="text-sm whitespace-pre-wrap text-mist">{content.text}</p>
          <ArtifactLinks canvasId={content.canvasId} entityId={content.entityId} />
        </div>
      </Card>
    </li>
  )
}

// The links a step or a result may carry. Rendered only for ids that exist — a
// dead link into a board the agent never created is worse than no link.
function ArtifactLinks({
  canvasId,
  entityId,
}: {
  canvasId?: string | undefined
  entityId?: string | undefined
}) {
  const { t } = useTranslation()
  if (canvasId === undefined && entityId === undefined) return null
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {canvasId !== undefined ? (
        <Link
          to="/canvas/$canvasId"
          params={{ canvasId }}
          className="text-portal underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('creator.result.openCanvas')}
        </Link>
      ) : null}
      {entityId !== undefined ? (
        <Link
          to="/soul/$entityId"
          params={{ entityId }}
          className="text-portal underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('creator.result.openSoul')}
        </Link>
      ) : null}
    </div>
  )
}

// Four glyphs for eight tools, grouped by WHAT THE STEP TOUCHED — catalog, a
// character, a board, a generation. A per-tool icon set would be eight drawings
// nobody can tell apart at 16px; the family is what a user scanning a long step
// list actually needs. Same 24-grid / 1.5-stroke / currentColor language as the
// rest of the app's icons (never an OS emoji — it would paint its own palette).
function StepGlyph({ tool, failed }: { tool: string; failed: boolean }) {
  const path = GLYPH_PATHS[glyphFamily(tool)]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`mt-0.5 size-4 shrink-0 ${failed ? 'text-glow-red' : 'text-mist-dim'}`}
    >
      {path}
    </svg>
  )
}

type GlyphFamily = 'catalog' | 'character' | 'board' | 'generation'

function glyphFamily(tool: string): GlyphFamily {
  if (tool.includes('entity')) return 'character'
  if (tool.includes('canvas')) return 'board'
  if (tool.includes('generation')) return 'generation'
  return 'catalog'
}

const GLYPH_PATHS: Record<GlyphFamily, ReactElement> = {
  // A list — reading the catalog
  catalog: (
    <>
      <path d="M8 7h11M8 12h11M8 17h11" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
    </>
  ),
  // A head and shoulders — a character was created or dressed
  character: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.6-3.4 4-5 7-5s5.4 1.6 7 5" />
    </>
  ),
  // A board with a wired node — the canvas
  board: (
    <>
      <rect x="3" y="4" width="8" height="6" rx="1.5" />
      <rect x="13" y="14" width="8" height="6" rx="1.5" />
      <path d="M11 7h3a3 3 0 013 3v4" />
    </>
  ),
  // The sparkle — a generation ran
  generation: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
}
