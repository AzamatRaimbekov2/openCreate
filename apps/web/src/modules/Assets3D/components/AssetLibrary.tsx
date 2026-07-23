// apps/web/src/modules/Assets3D/components/AssetLibrary.tsx
// The /assets page body: the modular-asset library with the full 4-states rule
// (loading skeletons → error+retry → empty+CTA → grid of AssetCard) plus the
// create modal. The route owns the page canvas; this owns the library.
//
// The CinemaLibrary silhouette, deliberately: both screens are "a shelf of
// things you open into a multi-stage workbench", and a user who has learned one
// should not have to learn the other.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useAssets } from '../model/asset3dApi'
import { AssetCard } from './AssetCard'
import { CreateAssetModal } from './CreateAssetModal'

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4']
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

export function AssetLibrary() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useAssets()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Loading: card-shaped silhouettes — the square concept plate plus its two
  // meta lines, so the grid does not reflow when the real cards land.
  if (isPending) {
    return (
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-3">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-normal text-white">{t('assets3d.title')}</h1>
        {/* GREEN specimen pill: creating an asset is the one create action on
            this screen, and it is free — the price lives on later stages */}
        <Button onClick={() => setIsCreateOpen(true)}>{t('assets3d.library.new')}</Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={t('assets3d.library.empty.title')}
          description={t('assets3d.library.empty.description')}
          action={
            <Button onClick={() => setIsCreateOpen(true)}>{t('assets3d.library.new')}</Button>
          }
        />
      ) : (
        <ul className={GRID}>
          {data.items.map((asset) => (
            <li key={asset.id}>
              <AssetCard asset={asset} />
            </li>
          ))}
        </ul>
      )}

      {/* Mounted only while open, so every create starts from a clean form
          (a stale data URI from an abandoned attempt would otherwise persist) */}
      {isCreateOpen ? <CreateAssetModal isOpen onClose={() => setIsCreateOpen(false)} /> : null}
    </div>
  )
}
