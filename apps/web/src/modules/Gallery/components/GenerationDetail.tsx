// apps/web/src/modules/Gallery/components/GenerationDetail.tsx
// Detail modal for a succeeded generation: full media, complete prompt and
// meta (cost, date), plus a download action. Opened from the card's media.
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Modal } from 'shared/ui'

export type GenerationDetailProps = {
  // The generation to present — callers only open it for succeeded items
  generation: Generation
  // Controlled visibility
  isOpen: boolean
  // Called on Escape, overlay click, and the close button
  onClose: () => void
}

export function GenerationDetail({ generation, isOpen, onClose }: GenerationDetailProps) {
  const { t, i18n } = useTranslation()
  const mediaUrl = generation.mediaUrls[0]
  // Locale-aware timestamp — follows the active language, not the browser
  const createdAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(generation.createdAt))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('gallery.detail.title')}>
      <div className="flex flex-col gap-4">
        {mediaUrl ? (
          // Media sits on the dark media well — the only dark surface (design.md §2)
          generation.type === 'video' ? (
            <video controls src={mediaUrl} className="w-full rounded-xl bg-media" />
          ) : (
            <img src={mediaUrl} alt={generation.prompt} className="w-full rounded-xl bg-media" />
          )
        ) : null}
        <p className="text-sm text-ink">{generation.prompt}</p>
        <p className="text-xs text-ink-soft">
          {t('gallery.cost', { count: generation.costCredits })} · {createdAt}
        </p>
        {mediaUrl ? (
          <a
            href={mediaUrl}
            download
            className="self-start text-sm font-medium text-vermillion underline focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            {t('gallery.download')}
          </a>
        ) : null}
      </div>
    </Modal>
  )
}
