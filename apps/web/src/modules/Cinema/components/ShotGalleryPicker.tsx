// apps/web/src/modules/Cinema/components/ShotGalleryPicker.tsx
// The "attach from gallery" picker: a modal grid of the user's OWN finished
// images. Picking one hands its /media URL back to the parent
// (ShotReferenceImages), which fetches the bytes and attaches them through the
// SAME add path as a file upload — this component never touches the mutation or
// the shared budget, it only chooses a URL.
//
// LAZY BY MOUNT: this component is rendered by the parent ONLY while the picker
// is open, so `useMyImageGenerations` fires exactly once the user asks for the
// gallery — mounting the reference control itself triggers no generations GET
// (and the sibling shot tests stay green).
import { useTranslation } from 'react-i18next'
import { Card, EmptyState, ErrorState, Modal, Skeleton } from 'shared/ui'
import { useMyImageGenerations } from '../model/galleryImagesApi'

// Skeleton tile count while the list loads — one filled grid row's worth so the
// loading state has the same visual weight as a small result set (no jump).
const SKELETON_TILES = 8

export type ShotGalleryPickerProps = {
  // Close the picker (Escape / overlay / ✕ / after a pick)
  onClose: () => void
  // Called with the picked image's /media URL — the parent fetches + attaches it
  onPick: (url: string) => void
}

export function ShotGalleryPicker({ onClose, onPick }: ShotGalleryPickerProps) {
  const { t } = useTranslation()
  // Mounted == open, so the Modal is always open here; the query runs on mount.
  const { data, isLoading, isError, refetch } = useMyImageGenerations()

  return (
    <Modal isOpen onClose={onClose} title={t('cinema.shotRef.galleryTitle')} size="lg">
      {/* The 4 UI states of the picker, resolved top-down. */}
      {isLoading ? (
        // Loading: pulsing plates at the tile radius — never a spinner.
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {Array.from({ length: SKELETON_TILES }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        // Error: localized message + retry — never the raw fetch failure.
        <ErrorState message={t('cinema.shotRef.galleryError')} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        // Empty: the user has no finished images to attach yet.
        <EmptyState title={t('cinema.shotRef.galleryEmpty')} />
      ) : (
        // Data: the pickable grid. Each tile is a real button (keyboard + AT),
        // the image inside is decorative (alt="") because the button carries
        // the accessible name.
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {data.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onPick(image.url)}
              aria-label={t('cinema.shotRef.galleryPick')}
              className="rounded-xl transition-shadow duration-200 hover:ring-2 hover:ring-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {/* Media lives in a recessed `well` Card — the plate reserved for
                  user media (design.md), never frosted. */}
              <Card surface="well" padding="none" className="aspect-square overflow-hidden">
                <img src={image.url} alt="" className="size-full object-cover" />
              </Card>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
