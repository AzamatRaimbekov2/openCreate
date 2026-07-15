// apps/web/src/modules/Soul/components/SoulPreview.tsx
// "What the model will see" — the composed prompt for the hero portrait, live,
// with a Copy button.
//
// It is not a nicety. The whole studio rests on the claim that clicking chips
// produces a specific sentence; showing that sentence is how the user learns the
// machine. And because it is produced by the SAME contract functions the API
// composes with (soulPresentation → composePortraitPrompt + applyPromptPreset),
// it cannot drift into a plausible lie.
//
// The NEGATIVE is shown too, quietly. It is half of what makes a reference sheet
// clean (no busy background, no second character, no watermark), and a user who
// cannot see it cannot understand why their character came out on a plain grey
// backdrop.
import { useTranslation } from 'react-i18next'
import type { Soul } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { composeSoulPreview } from '../model/soulPresentation'
import { CopyButton } from './CopyButton'

export type SoulPreviewProps = {
  // The draft being previewed — the preview is a pure function of it
  soul: Soul
}

export function SoulPreview({ soul }: SoulPreviewProps) {
  const { t } = useTranslation()
  const { positivePrompt, negativePrompt } = composeSoulPreview(soul)

  return (
    // A recessed well: the prompt is the machine's text, sunk one step below the
    // controls that produce it — not a frosted card competing with them
    <Card
      surface="well"
      padding="md"
      title={t('soul.preview.title')}
      action={<CopyButton text={positivePrompt} />}
    >
      <div className="flex flex-col gap-3">
        <p data-testid="soul-preview" className="text-sm leading-relaxed text-mist">
          {positivePrompt}
        </p>
        {negativePrompt ? (
          <p className="text-xs leading-relaxed text-mist-dim">
            <span className="text-mist-dim/70">{t('soul.preview.negative')}: </span>
            {negativePrompt}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
