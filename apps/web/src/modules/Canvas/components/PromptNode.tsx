// apps/web/src/modules/Canvas/components/PromptNode.tsx
// The SHARED PROMPT card (ADR canvas-prompt-node). One text, wired into several
// image/video nodes, which each prepend it to their own line. It exists because
// a board had no way to say the same thing twice: five variants of one subject
// meant pasting the shared half into five textareas, and editing five textareas
// when it changed.
//
// FURNITURE, like the character card: no input port, an output port, no model,
// no price, no Generate, and `RUNNABLE_KINDS` never lists it — a branch plan
// can therefore never show it as a priced row. It wears `NodeShell` at a
// permanent `idle` for exactly the reason EntityNode does: the board should
// have ONE language for "a card that feeds a producer", not two.
//
// The textarea carries the mandatory `EnhanceButton` sparkle (owner law,
// 2026-07-30). This is the field where it pays for itself most: one improved
// template lifts every wired child at once.
import { useTranslation } from 'react-i18next'
import { EnhanceButton } from 'shared/ui'
import { useCanvasStore } from '../model/canvasStore'
import { NodeShell } from './NodeShell'

export function PromptNode({ id }: { id: string }) {
  const { t } = useTranslation()
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)
  // How many nodes read this card. A narrow selector (a number, not the edge
  // array) so wiring an UNRELATED pair of nodes does not re-render this card.
  const feeds = useCanvasStore(
    (s) => s.edges.filter((edge) => edge.sourceNodeId === id).length,
  )
  if (!node) return null

  return (
    <NodeShell
      title={t('canvas.kind.prompt')}
      // Permanent idle: the card has no run of its own to report. NodeShell
      // still prints the word, and that consistency is the point (EntityNode).
      status="idle"
      hasInput={false}
      hasOutput
    >
      {/* The sparkle rides a WRAPPER, never EnhanceButton's own className — that
          class lands on its internal `relative` box, which is the anchor its
          error/nudge chip hangs from (the ShotInspector precedent). `nodrag` on
          both: React Flow must not start a canvas pan from a form field, and its
          hit test walks ancestors. */}
      <div className="relative">
        <textarea
          value={node.config.prompt ?? ''}
          onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
          placeholder={t('canvas.node.promptTemplatePlaceholder')}
          aria-label={t('canvas.kind.prompt')}
          rows={4}
          className="nodrag w-full resize-none rounded-lg border border-white/10 bg-steel px-2 py-1.5 pr-10 text-xs text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
        />
        <div className="nodrag absolute right-1 bottom-1">
          <EnhanceButton
            value={node.config.prompt ?? ''}
            onEnhanced={(prompt) => updateNodeConfig(id, { prompt })}
            className="nodrag"
          />
        </div>
      </div>

      {/* The one fact that makes a SHARED card legible: how far its text reaches.
          "feeds 0 nodes" would be a number pretending to be information, so the
          unwired state says what to do instead (the disabled-control law: a
          control with no explanation reads as a bug). */}
      <p className="mt-2 text-[11px] leading-4 text-mist-dim">
        {feeds === 0
          ? t('canvas.node.promptTemplateUnwired')
          : t('canvas.node.promptTemplateFeeds', { count: feeds })}
      </p>
    </NodeShell>
  )
}
