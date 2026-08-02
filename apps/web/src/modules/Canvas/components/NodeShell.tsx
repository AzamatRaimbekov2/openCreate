// apps/web/src/modules/Canvas/components/NodeShell.tsx
// Shared chrome for every canvas node: an OPAQUE steel card carrying the run
// status, plus the React Flow handles that make it wirable. Nodes are ordinary
// DOM (ADR canvas-mode D4) — this is a styled wrapper, not a renderer.
//
// Opaque steel rather than the glass Card primitive on purpose: a node sits on
// a textured dot canvas with wires and media moving behind it, which is the
// same argument that keeps Select's popup panel opaque (design.md §3.5). Glass
// would also fight the status border — the frosted recipe ships its own
// border-color utilities, and Tailwind resolves competing ones by stylesheet
// order, not class order, so the status could silently lose.
import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { NodeRunStatus } from '../model/types'

// Status is never color-only (a11y law): the border and the WORD always agree.
const STATUS_BORDER: Record<NodeRunStatus, string> = {
  idle: 'border-white/10',
  processing: 'border-glow-amber',
  succeeded: 'border-glow-green',
  failed: 'border-glow-red',
}
const STATUS_TEXT: Record<NodeRunStatus, string> = {
  idle: 'text-mist-dim',
  processing: 'text-glow-amber',
  succeeded: 'text-glow-green',
  failed: 'text-glow-red',
}

export type NodeShellProps = {
  // Kind label in the header ("Image", "Video", …) — already localized
  title: string
  status: NodeRunStatus
  // 0–100 while processing, null before the provider reports any (I5,
  // ShotClipStatus precedent) — ignored for every other status.
  progress?: number | null
  // Left port: does this kind accept an incoming wire?
  hasInput: boolean
  // Right port: can this kind feed another node? (video is terminal in MVP)
  hasOutput: boolean
  children: ReactNode
}

export function NodeShell({
  title,
  status,
  progress = null,
  hasInput,
  hasOutput,
  children,
}: NodeShellProps) {
  const { t } = useTranslation()
  return (
    <div className={`w-72 rounded-2xl border bg-steel p-3 shadow-glass ${STATUS_BORDER[status]}`}>
      {/* THE PORT IS A 24px HIT AREA WEARING A 12px DOT (owner report
          2026-08-02: "привязка не работает"). React Flow's default port is 8px,
          and a wire has to be GRABBED from one and DROPPED on another — at 8px
          that is below pointer accuracy, and the punishment for a miss is not
          "nothing": a press that lands beside the port hits the PANE, so the
          board pans away under the cursor. Reproduced live before this change.
          So the Handle itself is transparent and big (`size-6`, no border, no
          fill), and the dot the user sees is a child element with
          `pointer-events-none` — the target grew, the design did not. Paired
          with the editor's `connectionRadius={80}`, which forgives the drop. */}
      {hasInput ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!flex !size-6 !items-center !justify-center !border-0 !bg-transparent"
        >
          <span className="pointer-events-none block size-3 rounded-full border-2 border-void bg-portal" />
        </Handle>
      ) : null}
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-white">{title}</span>
        {/* The WORD carries the status; the border repeats it for glanceability */}
        <span className={`shrink-0 text-[11px] ${STATUS_TEXT[status]}`}>
          {t(`canvas.status.${status}`)}
          {status === 'processing' && progress !== null ? ` · ${progress}%` : ''}
        </span>
      </header>
      {children}
      {hasOutput ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!flex !size-6 !items-center !justify-center !border-0 !bg-transparent"
        >
          <span className="pointer-events-none block size-3 rounded-full border-2 border-void bg-glow-green" />
        </Handle>
      ) : null}
    </div>
  )
}
