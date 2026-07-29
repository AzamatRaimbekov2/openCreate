// apps/web/src/modules/Canvas/components/NodePalette.tsx
// Left rail: the node kinds this phase ships. Drag onto the board (the
// dataTransfer carries the kind; CanvasEditor's onDrop converts the pointer to
// flow coordinates) or click to drop one at the viewport center — the click
// path exists because drag-and-drop is not keyboard-reachable.
// Character and operation nodes arrive in phases 3-4.
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasNodeKind } from '@opencreate/contracts'

export const NODE_KIND_MIME = 'application/x-opencreate-node-kind'

// Glyphs are decorative; the label carries the meaning (never icon-only).
const PALETTE: { kind: CanvasNodeKind; glyph: string }[] = [
  { kind: 'image', glyph: '▣' },
  { kind: 'video', glyph: '▶' },
  { kind: 'upload', glyph: '⇧' },
  { kind: 'note', glyph: '✎' },
]

export function NodePalette({ onAdd }: { onAdd: (kind: CanvasNodeKind) => void }) {
  const { t } = useTranslation()
  const handleDragStart = (event: DragEvent, kind: CanvasNodeKind) => {
    event.dataTransfer.setData(NODE_KIND_MIME, kind)
    event.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside
      aria-label={t('canvas.palette.label')}
      className="flex w-24 shrink-0 flex-col gap-2 border-r border-white/10 p-2"
    >
      {PALETTE.map(({ kind, glyph }) => (
        <button
          key={kind}
          type="button"
          draggable
          onDragStart={(e) => handleDragStart(e, kind)}
          onClick={() => onAdd(kind)}
          className="flex min-h-10 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-steel py-3 text-mist transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          <span aria-hidden="true" className="text-base">
            {glyph}
          </span>
          <span className="text-[11px]">{t(`canvas.kind.${kind}`)}</span>
        </button>
      ))}
    </aside>
  )
}
