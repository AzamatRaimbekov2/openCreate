// apps/web/src/modules/Assets3D/components/PartGenerationCard.tsx
// One part's plate in a paid grid — the same component for extraction and for
// meshing, because from the user's side they are the same shape of wait: I paid,
// something is rendering upstream, tell me the truth about it.
//
// THE CITATION PROBLEM (plan Fix FG-1). A part does not carry a Generation, it
// carries a generation ID (`imageGenerationId` / `meshGenerationId`), and the
// asset aggregate embeds no generation objects. So on a cold load there is
// nothing to read a status from — this card must FETCH the cited id itself
// (`useLivePartGeneration`, the Cinema fetch-by-id precedent). A null citation
// disables that query entirely and the card shows its pre-generation state:
// "not extracted yet" is a STATE, not a spinner.
//
// The hook is called EXACTLY ONCE here and its answer is threaded down as props.
// That is not style — `useLivePartGeneration` has a side effect (it refreshes
// ['generations'] and ['me'] once on the processing→terminal transition), and
// calling it again in each sub-view would fire that refresh once per view.
//
// The states of the wait, and why each looks the way it does:
//   · no citation → the parent's CTA. Nothing has been paid.
//   · fetching the citation → Skeleton shaped like the plate, so the grid does
//     not reflow when the answer lands.
//   · processing → Progress + a text status. Never a bare spinner: a paid wait
//     with no visible progress is where users click "generate" a second time.
//   · succeeded → the poster in a `well` plate (media is CONTENT — never glass).
//   · failed → OUR localized reason plus the refunded chip. The refund already
//     happened server-side; the card's job is to SAY so, because a silent
//     failure on a paid action reads as theft.
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import type { Asset3dPart, Generation } from '@opencreate/contracts'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Badge, Card, Progress, Skeleton } from 'shared/ui'
import { useLivePartGeneration } from '../model/partGeneration'

// Which half of the paid flow this card is showing. It selects the locale
// namespace (`assets3d.extract.*` vs `assets3d.mesh.*`) so the two grids can
// speak about extracting and meshing in their own words while sharing one
// component — the AssetWizard `t(`assets3d.stage.${stage}`)` precedent.
export type PartGenerationKind = 'extract' | 'mesh'

export type PartGenerationCardProps = {
  // The part this plate belongs to
  part: Asset3dPart
  // Which citation to poll and which copy to use
  kind: PartGenerationKind
  // The cited generation id, or null when nothing has been generated yet. Passed
  // in (rather than read off `part`) so the caller stays explicit about WHICH of
  // the two citations this plate is about.
  generationId: string | null
  // The action row under the plate — the priced button, the tier picker, or a
  // reason why this part cannot act yet. Owned by the stage, which knows the price.
  action: ReactNode
  // A localized, already-safe reason the LAST mutation for this part failed.
  // Distinct from a failed GENERATION: a rejected mutation never charged, so it
  // carries no refund chip.
  mutationError?: string | null | undefined
}

export function PartGenerationCard({
  part,
  kind,
  generationId,
  action,
  mutationError = null,
}: PartGenerationCardProps) {
  const { t } = useTranslation()
  const { data, isPending, isError } = useLivePartGeneration(generationId)

  // `isPending` is TanStack's "no data yet" — but a DISABLED query is also
  // pending forever, so a null citation must be excluded or every un-extracted
  // plate would pulse as though something were on its way.
  const isResolving = generationId !== null && isPending
  // A poll that fails before any answer arrived is its own state: the part may
  // well be fine, we simply cannot see it.
  const isUnreadable = generationId !== null && isError && data === undefined

  return (
    <div className="flex flex-col gap-2">
      {/* The plate. A generated image is CONTENT, so it sits in a recessed well
          — frosting glass over the thing the user paid for is exactly backwards. */}
      <Card surface="well" padding="none" className="overflow-hidden">
        <div className="flex aspect-square w-full items-center justify-center">
          <Plate
            kind={kind}
            name={part.name}
            generation={data}
            isResolving={isResolving}
            hasCitation={generationId !== null}
          />
        </div>
      </Card>

      <p className="truncate text-sm text-mist">{part.name}</p>

      {/* Status is carried by TEXT (a11y: never color-only). Which chip appears
          is decided by the polled citation, never by the optimistic store. */}
      {data?.status === 'processing' ? (
        <span className="text-xs text-glow-amber">{t(`assets3d.${kind}.processing`)}</span>
      ) : data?.status === 'succeeded' ? (
        <span>
          <Badge variant="success">{t(`assets3d.${kind}.ready`)}</Badge>
        </span>
      ) : null}

      {/* Amber, not red: nothing has failed — we just lost sight of it. */}
      {isUnreadable ? (
        <p role="status" className="text-xs text-glow-amber">
          {t(`assets3d.${kind}.pollFailed`)}
        </p>
      ) : null}

      {/* A FAILED generation was charged and refunded server-side — say both. */}
      {data?.status === 'failed' ? (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-xs text-glow-red">
            {t(errorCodeMessageKey(data.errorCode))}
          </p>
          <span>
            <Badge variant="success">{t(`assets3d.${kind}.refunded`)}</Badge>
          </span>
        </div>
      ) : null}

      {/* A rejected MUTATION never charged, so it gets the reason and no chip. */}
      {mutationError ? (
        <p role="alert" className="text-xs text-glow-red">
          {mutationError}
        </p>
      ) : null}

      {/* Determinate progress when the provider reports it; 0 is honest too. */}
      {data?.status === 'processing' ? (
        <Progress value={data.progress ?? 0} label={t(`assets3d.${kind}.processing`)} />
      ) : null}

      {action}
    </div>
  )
}

type PlateProps = {
  kind: PartGenerationKind
  name: string
  // The polled citation, or undefined while it resolves / when there is none
  generation: Generation | undefined
  // The citation exists and its fetch has not answered yet
  isResolving: boolean
  // Whether anything has been generated for this part at all
  hasCitation: boolean
}

// The square itself. Split out so the branching stays legible and so the
// "nothing paid for yet" case reads as a deliberate empty plate rather than an
// eternal skeleton — the difference between "waiting" and "not started" is the
// whole reason a user does or does not click a paid button a second time.
function Plate({ kind, name, generation, isResolving, hasCitation }: PlateProps) {
  const { t } = useTranslation()

  if (!hasCitation) {
    return <span className="px-2 text-center text-xs text-mist-dim">{t(`assets3d.${kind}.pending`)}</span>
  }
  if (isResolving || generation?.status === 'processing') {
    return <Skeleton className="size-full rounded-none" />
  }
  const poster = generation?.status === 'succeeded' ? generation.mediaUrls[0] : undefined
  if (poster === undefined) {
    return <span className="px-2 text-center text-xs text-mist-dim">{t(`assets3d.${kind}.pending`)}</span>
  }
  // A mesh generation's mediaUrls[0] is a .glb, which no <img> can paint. The
  // mesh plate therefore states the outcome and leaves the geometry to the
  // Assembly viewer — the surface actually built to render it.
  if (kind === 'mesh') {
    return <span className="px-2 text-center text-xs text-glow-green">{t('assets3d.mesh.ready')}</span>
  }
  return (
    <img
      src={poster}
      alt={t(`assets3d.${kind}.posterAlt`, { name })}
      className="size-full object-cover"
    />
  )
}
