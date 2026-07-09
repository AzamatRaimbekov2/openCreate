// apps/web/src/modules/Gallery/components/GenerationRow.tsx
// One generation as a TABLE ROW — the dense view. Where the card makes the media
// the hero, the row makes the METADATA comparable: model, format, cost and date
// line up in columns so a user can see, at a glance, which settings produced
// which result and what each one cost.
//
// It shares the card's live behaviour (useLiveGeneration polls processing rows)
// and its action set (useGenerationActions — same confirmation, same optimistic
// removal, same overflow menu). What it drops is the large plate: a 40px
// thumbnail and a one-line prompt, because a table whose rows are 300px tall is
// not a table.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Badge, Menu } from 'shared/ui'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useLiveGeneration } from '../model/generationsApi'
import { GenerationDetail } from './GenerationDetail'
import { DotsIcon } from './icons'
import { useGenerationActions } from './useGenerationActions'

export type GenerationRowProps = {
  // List item from the ['generations'] cache — the row keeps it live itself
  generation: Generation
  // Refill the composer from this generation (injected by the route)
  onRegenerate?: (generation: Generation) => void
}

const CELL = 'px-3 py-2 align-middle text-sm text-mist'

export function GenerationRow({ generation: seed, onRegenerate }: GenerationRowProps) {
  const { t, i18n } = useTranslation()
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const { generation } = useLiveGeneration(seed)
  // The SAME action set as the card's menu and the detail rail — one rule set
  const { actions, confirmDialog } = useGenerationActions({
    generation,
    ...(onRegenerate ? { onRegenerate } : {}),
  })

  const mediaUrl = generation.mediaUrls[0]
  const isSucceeded = generation.status === 'succeeded'

  // Locale-aware short date — the table's only formatted value. Intl, not a
  // hand-rolled slice: 'ru' and 'en' order day/month differently.
  const created = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(generation.createdAt))

  return (
    <tr className="border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.03]">
      <td className={CELL}>
        {isSucceeded && mediaUrl ? (
          generation.type === 'video' ? (
            // No <video> in a row: a poster-less video element in 40px is a
            // black square. The type chip next to it already says "video".
            <div className="size-10 rounded-md bg-abyss" aria-hidden="true" />
          ) : (
            // The thumbnail opens the same detail modal the card's plate does
            <button
              type="button"
              onClick={() => setIsDetailOpen(true)}
              aria-label={generation.prompt}
              className="rounded-md focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <img
                src={mediaUrl}
                alt=""
                loading="lazy"
                className="size-10 rounded-md bg-abyss object-cover"
              />
            </button>
          )
        ) : (
          <div className="size-10 rounded-md bg-abyss" aria-hidden="true" />
        )}
      </td>
      {/* The prompt gets the flexible column and truncates — the full text is
          one click away in the detail modal, and a wrapping prompt would undo
          the row height the dense view exists for */}
      <td className={`${CELL} max-w-0 min-w-40 truncate`} title={generation.prompt}>
        {generation.prompt}
      </td>
      <td className={`${CELL} whitespace-nowrap`}>
        {/* Status is never color-only (a11y): each chip states its word */}
        {generation.status === 'processing' ? (
          // Amber text, not a Badge: the kit has no 'warning' variant, and the
          // card says "processing" in plain glow-amber too — one status voice
          <span className="text-xs text-glow-amber">{t('gallery.processing')}</span>
        ) : null}
        {isSucceeded ? <Badge variant="success">{t('gallery.ready')}</Badge> : null}
        {generation.status === 'failed' ? (
          // OUR copy keyed by errorCode — raw provider text never leads
          <span className="text-xs text-glow-red" title={t(errorCodeMessageKey(generation.errorCode))}>
            {t('gallery.failed')}
          </span>
        ) : null}
      </td>
      <td className={`${CELL} whitespace-nowrap text-mist-dim`}>
        {t(`generator.type.${generation.type}`)}
      </td>
      {/* modelId, not a display name: the row must not reach into the Generator
          catalog (cross-module import). The id is what the filter matches on. */}
      <td className={`${CELL} whitespace-nowrap text-mist-dim`}>{generation.modelId}</td>
      <td className={`${CELL} whitespace-nowrap text-mist-dim`}>
        {generation.params.aspectRatio}
      </td>
      <td className={`${CELL} whitespace-nowrap text-mist-dim`}>
        {t('gallery.cost', { count: generation.costCredits })}
      </td>
      <td className={`${CELL} whitespace-nowrap text-mist-dim`}>{created}</td>
      <td className={CELL}>
        <div className="flex items-center justify-end gap-1">
          {/* The row shows no inline download/delete: the overflow menu is the
              one place actions live, in every view. A table crowded with two
              controls per row was the noise this redesign removed. */}
          <Menu
            label={t('gallery.actions.label')}
            items={actions}
            triggerClassName="flex size-8 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <DotsIcon />
          </Menu>
        </div>
        {confirmDialog}
        {/* The modal lives inside the actions cell, not in a hidden <td>: only
            <td>/<th> may be children of <tr>, and a display:none cell just to
            park a dialog is a layout lie the browser is free to reflow. */}
        {isSucceeded ? (
          <GenerationDetail
            generation={generation}
            {...(onRegenerate ? { onRegenerate } : {})}
            isOpen={isDetailOpen}
            onClose={() => setIsDetailOpen(false)}
          />
        ) : null}
      </td>
    </tr>
  )
}
