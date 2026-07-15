// apps/web/src/modules/Soul/components/SoulAnimate.tsx
// "Оживить" — the primary portrait becomes the first frame of a video.
//
// EXPLICIT, PRICED, CONFIRMED. A video is 35–140 credits: an order of magnitude
// above a portrait, and the owner rejected the "auto-generate on create" option
// for exactly that reason (ADR, alternative F). So it is a button the user has to
// find, with the number on it, behind an alertdialog that says the number again.
//
// It is also a PLAIN generation: POST /api/generations with an inputImage. No new
// endpoint, no new money path — the generation service already owns charge,
// refund, poll and the NSFW gate, and a second copy of any of those is a bug we
// would only find in the ledger.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, CatalogModel, Entity, Generation } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Badge, Button, Card, Modal, Progress, Select, Skeleton } from 'shared/ui'
import { useAnimateSoul, useSoulVideo } from '../model/soulApi'

export type SoulAnimateProps = {
  // The character being animated — its primary image is the first frame
  entity: Entity
  // The live catalog; the video models are picked out of it here
  models: CatalogModel[]
}

// A character sheet is shot portrait-first, and a talking character reads better
// tall. Fall back to whatever the model does support.
function pickAspect(model: CatalogModel): AspectRatio {
  if (model.aspectRatios.includes('9:16')) return '9:16'
  return model.aspectRatios[0] ?? '1:1'
}

export function SoulAnimate({ entity, models }: SoulAnimateProps) {
  const { t } = useTranslation()
  const animateMutation = useAnimateSoul()

  const videoModels = models.filter((model) => model.type === 'video')
  const [modelId, setModelId] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  // The prompt starts as the character's own derived description — the words the
  // model already knows this person by — and stays editable: the user is
  // describing an ACTION now, not a person.
  const [prompt, setPrompt] = useState(entity.description)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  // The clip this session made. Not persisted anywhere: a video is an ordinary
  // generation and lives in /library; the card only shows the one just minted.
  const [videoId, setVideoId] = useState<string | null>(null)

  const video = useSoulVideo(videoId)

  // Derive the selection instead of syncing it in an effect: the catalog can land
  // AFTER the first render, and an effect that "fixes up" state on arrival is how
  // a picker ends up one render behind the data it was built from.
  const selected = videoModels.find((model) => model.id === modelId) ?? videoModels[0] ?? null
  const durations = selected?.type === 'video' ? selected.durationOptions : []
  const activeDuration = duration !== null && durations.includes(duration) ? duration : durations[0]

  const credits =
    selected?.type === 'video' && activeDuration !== undefined
      ? (selected.creditsByDuration[String(activeDuration)] ?? null)
      : null

  const primary = entity.images.find((image) => image.id === entity.primaryImageId) ?? null
  const canAnimate =
    primary !== null && selected !== null && credits !== null && prompt.trim().length >= 2

  const confirmAnimate = () => {
    if (!primary || !selected || activeDuration === undefined) return
    setIsConfirmOpen(false)
    animateMutation.mutate(
      {
        imageUrl: primary.url,
        input: {
          modelId: selected.id,
          prompt: prompt.trim(),
          aspectRatio: pickAspect(selected),
          duration: activeDuration,
          // The style (and its negative) travels as STRUCTURE — the server
          // composes. The framing preset is deliberately NOT sent: a reference
          // sheet is how you photograph a character, not how you animate one.
          ...(entity.soul ? { promptPreset: { styleId: entity.soul.styleId } } : {}),
        },
      },
      { onSuccess: (generation) => setVideoId(generation.id) },
    )
  }

  const submitError =
    animateMutation.error instanceof ApiClientError
      ? t(errorCodeMessageKey(animateMutation.error.code))
      : animateMutation.isError
        ? t('errors.actionFailed')
        : null

  return (
    <Card surface="glass" padding="lg" title={t('soul.animate.title')}>
      <div className="flex flex-col gap-4">
        {primary === null ? (
          // Nothing to animate yet — say why, and do not show a dead button
          <p className="text-sm text-mist-dim">{t('soul.animate.needPhoto')}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {videoModels.length === 0 ? (
                // Catalog still in flight: shaped placeholders, never an empty box
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : (
                <>
                  <Select
                    label={t('soul.animate.model')}
                    options={videoModels.map((model) => ({
                      value: model.id,
                      label: model.name,
                      caption: model.providerLabel,
                    }))}
                    value={selected?.id ?? ''}
                    onChange={setModelId}
                  />
                  <Select<string>
                    label={t('soul.animate.duration')}
                    options={durations.map((seconds) => ({
                      value: String(seconds),
                      label: t('generator.duration.seconds', { count: seconds }),
                    }))}
                    value={String(activeDuration ?? '')}
                    onChange={(value) => setDuration(Number(value))}
                  />
                </>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-mist-dim">{t('soul.animate.prompt')}</span>
              <textarea
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
              />
            </label>

            {submitError ? (
              <p
                role="alert"
                className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
              >
                {submitError}
              </p>
            ) : null}

            <div className="flex items-center justify-end">
              <Button
                onClick={() => setIsConfirmOpen(true)}
                disabled={!canAnimate || animateMutation.isPending}
                isLoading={animateMutation.isPending}
              >
                {t('soul.animate.cta')} ·{' '}
                {credits === null ? (
                  <Skeleton className="h-3 w-10" />
                ) : (
                  <span>{t('soul.price', { credits })}</span>
                )}
              </Button>
            </div>

            <SoulVideo
              status={video.data?.status ?? null}
              progress={video.data?.progress ?? null}
              mediaUrl={video.data?.mediaUrls[0] ?? null}
              errorCode={video.data?.errorCode ?? null}
              isPollFailed={video.isError}
            />
          </>
        )}
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        role="alertdialog"
        title={t('soul.animate.confirm.title')}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-mist">
            {t('soul.animate.confirm.description', { credits: credits ?? 0 })}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmAnimate} disabled={!canAnimate}>
              {t('soul.animate.confirm.submit', { credits: credits ?? 0 })}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

type SoulVideoProps = {
  // null = nothing was minted this session (the resting state)
  status: Generation['status'] | null
  progress: number | null
  mediaUrl: string | null
  errorCode: string | null
  isPollFailed: boolean
}

// The clip's four states. A failed video is a REFUNDED video (the generation
// service refunds inside the same transaction that marks the row failed), and
// saying so is the difference between a bug and a bad roll of the dice.
function SoulVideo({ status, progress, mediaUrl, errorCode, isPollFailed }: SoulVideoProps) {
  const { t } = useTranslation()

  if (status === null) return null

  if (isPollFailed) {
    return (
      <p role="status" className="text-sm text-glow-amber">
        {t('gallery.pollFailed')}
      </p>
    )
  }

  if (status === 'processing') {
    return (
      <div className="flex flex-col gap-2">
        <Progress value={progress ?? 0} label={t('soul.animate.processing')} />
        <span className="text-xs text-glow-amber">{t('soul.animate.processing')}</span>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-sm text-glow-red">
          {t(errorCodeMessageKey(errorCode))}
        </p>
        <span>
          <Badge variant="success">{t('soul.sheet.refunded')}</Badge>
        </span>
      </div>
    )
  }

  if (mediaUrl === null) return null

  return (
    // The clip is content: a recessed well plate, letterboxed, never cropped
    <Card surface="well" padding="none" className="overflow-hidden">
      <video src={mediaUrl} controls className="max-h-[60dvh] w-full bg-abyss object-contain" />
    </Card>
  )
}
