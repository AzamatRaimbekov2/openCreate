// apps/web/src/modules/Canvas/components/NoteNode.tsx
// Sticky note: free text, no ports, never runs (spec §3). Amber-tinted so it
// reads as annotation rather than as a generator block — the same "explore /
// aside" role amber carries everywhere else in the triad. It skips NodeShell
// on purpose: a note has no status and no handles, so the shared chrome would
// only add a border it must not have.
import { useTranslation } from 'react-i18next'
import { useCanvasStore } from '../model/canvasStore'

export function NoteNode({ id }: { id: string }) {
  const { t } = useTranslation()
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)
  if (!node) return null
  return (
    <div className="w-56 rounded-2xl border border-specimen-amber/40 bg-specimen-amber/20 p-3 shadow-glass">
      <textarea
        value={node.config.text ?? ''}
        onChange={(e) => updateNodeConfig(id, { text: e.target.value })}
        placeholder={t('canvas.node.notePlaceholder')}
        rows={3}
        aria-label={t('canvas.node.note')}
        className="nodrag w-full resize-none bg-transparent text-xs text-lumen-amber placeholder:text-lumen-amber/50 focus-visible:outline-none"
      />
    </div>
  )
}
