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
          // Media sits on the abyss well — one surface step BELOW the modal's
          // steel sheet, so the user's work reads as recessed film (v3 §2)
          generation.type === 'video' ? (
            <video controls src={mediaUrl} className="w-full rounded-lg bg-abyss" />
          ) : (
            <img src={mediaUrl} alt={generation.prompt} className="w-full rounded-lg bg-abyss" />
          )
        ) : null}
        {/* Figure caption voice — the same quiet mono prompt as the card */}
        <p className="text-base leading-snug text-mist">{generation.prompt}</p>
        <p className="text-xs text-mist-dim">
          {t('gallery.cost', { count: generation.costCredits })} · {createdAt}
        </p>
        {mediaUrl ? (
          // Portal blue — the sanctioned prose-link color (v3 §2)
          <a
            href={mediaUrl}
            download
            className="self-start text-sm font-medium text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('gallery.download')}
          </a>
        ) : null}
      </div>
    </Modal>
  )
}
