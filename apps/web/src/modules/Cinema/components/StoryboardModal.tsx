// apps/web/src/modules/Cinema/components/StoryboardModal.tsx
// Script → draft shots. A modal with a script textarea, a style picker and an
// optional shot count. The returned drafts (generationId = null — nothing
// generated or charged) appear on the timeline once the film reloads. The
// endpoint is key-gated on the API: when ANTHROPIC_API_KEY is unset it answers
// provider_error, which we surface INLINE as "storyboard isn't configured"
// rather than a scary failure — storyboarding is optional, not broken.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StyleId } from '@opencreate/contracts'
import { Button, Modal, Select } from 'shared/ui'
import { ApiClientError } from 'shared/libs/apiClient'
import { useStoryboard } from '../model/storyboardApi'
import { styleOptions } from '../model/presetOptions'
import type { StyleChoice } from '../model/presetOptions'

export type StoryboardModalProps = {
  filmId: string
  // Prefill the style with the film's default (if any)
  defaultStyleId: StyleId | null
  isOpen: boolean
  onClose: () => void
}

// '' = let the model choose the count
const SHOT_COUNTS = ['', '3', '4', '5', '6', '8'] as const

export function StoryboardModal({ filmId, defaultStyleId, isOpen, onClose }: StoryboardModalProps) {
  const { t } = useTranslation()
  const storyboard = useStoryboard()

  const [script, setScript] = useState('')
  const [styleId, setStyleId] = useState<StyleChoice>(defaultStyleId ?? '')
  const [shotCount, setShotCount] = useState<string>('')

  // A clean provider_error means the LLM key is not configured — an expected,
  // non-alarming state, not a crash.
  const isUnavailable =
    storyboard.error instanceof ApiClientError && storyboard.error.code === 'provider_error'
  const canSubmit = script.trim().length >= 10 && !storyboard.isPending

  const handleSubmit = () => {
    if (script.trim().length < 10) return
    storyboard.mutate(
      {
        filmId,
        input: {
          script: script.trim(),
          ...(styleId ? { styleId } : {}),
          ...(shotCount ? { shotCount: Number(shotCount) } : {}),
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('cinema.storyboard.title')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-mist-dim">{t('cinema.storyboard.script')}</span>
          <textarea
            rows={6}
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={t('cinema.storyboard.scriptPlaceholder')}
            className="resize-none rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Select<StyleChoice>
            label={t('cinema.settings.style')}
            options={[{ value: '', label: t('cinema.settings.styleNone') }, ...styleOptions(t)]}
            value={styleId}
            onChange={setStyleId}
          />
          <Select
            label={t('cinema.storyboard.shotCount')}
            options={SHOT_COUNTS.map((value) => ({
              value,
              label: value === '' ? t('cinema.storyboard.shotCountAuto') : value,
            }))}
            value={shotCount}
            onChange={setShotCount}
          />
        </div>

        {isUnavailable ? (
          <p role="status" className="text-sm text-glow-amber">
            {t('cinema.storyboard.unavailable')}
          </p>
        ) : storyboard.isError ? (
          <p role="alert" className="text-sm text-glow-red">
            {t('errors.actionFailed')}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={storyboard.isPending} disabled={!canSubmit}>
            {t('cinema.storyboard.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
