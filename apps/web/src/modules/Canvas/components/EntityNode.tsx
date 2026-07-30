// apps/web/src/modules/Canvas/components/EntityNode.tsx
// The character node (ADR canvas-mode phase 3, spec §3-4): a compact card that
// supplies ONE Soul character to whatever it is wired into. It is the only
// generation-adjacent node that never runs — it holds no prompt, no model, no
// price and no history, so its status is idle steel forever and it carries an
// OUTPUT port only.
//
// What it actually does is name an `entityId`. The consumer node turns that into
// `entityRefs` at submit time (see buildRunInput), and the SERVER substitutes the
// character's name + description into the prompt and attaches her photo as a
// reference. The card therefore has exactly one job: make "which character"
// unmistakable at a glance on a board where several cards compete for attention
// — which is why the FACE ships alongside the name (contracts/entity.ts: a tag
// is structure, and getting the wrong subject is a silent, paid failure).
//
// The character library arrives as node DATA from the route seam: Canvas may not
// import modules/Entities any more than it may import modules/Generator.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Select, WELL_SURFACE } from 'shared/ui'
import type { SelectOption } from 'shared/ui'
import type { CanvasEntityOption } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { NodeShell } from './NodeShell'

export type EntityNodeData = { entities: CanvasEntityOption[] }

export function EntityNode({ id, data }: { id: string; data: EntityNodeData }) {
  const { t } = useTranslation()
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)

  if (!node) return null

  const entities = data.entities
  const chosen = entities.find((entity) => entity.id === node.config.entityId)
  const options: SelectOption<string>[] = entities.map((entity) => ({
    value: entity.id,
    label: entity.name,
  }))

  return (
    <NodeShell
      title={t('canvas.kind.character')}
      // A character never runs, so the shell's status ladder collapses to its
      // first rung. Passing 'idle' explicitly (rather than teaching NodeShell a
      // fifth "statusless" mode) keeps ONE status vocabulary on the board.
      status="idle"
      hasInput={false}
      hasOutput
    >
      {entities.length === 0 ? (
        // 4-states law, inside a node: an empty Soul library must not render an
        // empty dropdown that answers nothing. Say why it is empty and hand over
        // the way out. role=status so a screen reader hears the state, not just
        // a stray link.
        <p role="status" className="text-[11px] leading-5 text-mist-dim">
          {t('canvas.node.characterEmpty')}{' '}
          {/* nodrag: React Flow would otherwise start panning the board from a
              pointer-down on the link and the click would never land. */}
          <Link
            to="/soul"
            className="nodrag rounded text-portal underline transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('canvas.node.characterEmptyCta')}
          </Link>
        </p>
      ) : (
        // Face BESIDE the picker, not above it: the picker's trigger already
        // carries the chosen name, so a separate name line would print the same
        // word twice inside a 288px card. This way each of the spec's three
        // elements is stated exactly once — avatar (the plate), name (the
        // trigger), "from Soul" (the picker's caption).
        <div className="flex items-end gap-2">
          {chosen ? (
            // The photo is CONTENT (an uploaded or Soul-generated face), so it
            // sits on a well plate at object-cover and is never frosted. A
            // character with no photo yet keeps the plate's box — the row must
            // not change height the moment a face lands.
            <span
              className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 ${WELL_SURFACE}`}
            >
              {chosen.imageUrl ? (
                <img src={chosen.imageUrl} alt={chosen.name} className="size-full object-cover" />
              ) : (
                <span aria-hidden="true" className="text-sm text-mist-dim">
                  ☺
                </span>
              )}
            </span>
          ) : null}
          {/* The picker stays visible after a choice — recasting a chain is a
              normal edit, not a rebuild. */}
          <div className="min-w-0 flex-1">
            <Select
              label={t('canvas.node.fromSoul')}
              options={options}
              value={node.config.entityId ?? ''}
              onChange={(entityId) => updateNodeConfig(id, { entityId })}
              placeholder={t('canvas.node.characterPlaceholder')}
            />
          </div>
        </div>
      )}
    </NodeShell>
  )
}
