// apps/web/src/modules/Cinema/components/ShotVoiceoverField.tsx
// The "Voice" group of the shot inspector: the line this beat's character speaks,
// who speaks it, and the button that turns it into audio on the timeline.
//
// ADR: docs/wiki/decisions/template-catalog.md §4
//
// Two things this control is careful about, both of them about money:
//
//  1. THE PRICE IS ON THE BUTTON. Generating a line costs credits. A bare
//     "Generate" next to a textarea reads like a preview; the credit count makes
//     it read like what it is.
//  2. VOICED IS A VISIBLE STATE. Once a shot has a track, the action becomes
//     "Re-voice" and says so — because re-voicing charges again, and the user is
//     entitled to know they are about to pay for something they already have. The
//     API replaces rather than appends, so they will not end up with two lines
//     playing over each other; but the second charge is real.
//
// Mirrors ShotTitleField: an amber toggle discloses the fields, so a shot with no
// dialogue shows one quiet pill instead of a dead textarea.
import { useTranslation } from 'react-i18next'
import { Button, Select } from 'shared/ui'
import { MicIcon, SparkIcon } from './icons'

export type ShotVoiceoverFieldProps = {
  isEnabled: boolean
  onToggle: () => void
  text: string
  onTextChange: (text: string) => void
  voice: string
  onVoiceChange: (voice: string) => void
  // Voices offered by the tts catalog model. Empty = TTS is not configured, and
  // the whole group hides rather than offering a button that cannot work.
  voices: string[]
  // What one line costs, from the catalog. Shown on the button.
  credits: number
  // Whether this shot already has a voiceover track on the timeline.
  isVoiced: boolean
  onGenerate: () => void
  isGenerating: boolean
}

export function ShotVoiceoverField({
  isEnabled,
  onToggle,
  text,
  onTextChange,
  voice,
  onVoiceChange,
  voices,
  credits,
  isVoiced,
  onGenerate,
  isGenerating,
}: ShotVoiceoverFieldProps) {
  const { t } = useTranslation()

  // No tts model in the catalog → there is nothing this group could do.
  if (voices.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-pressed={isEnabled}
        onClick={onToggle}
        className={`flex w-fit min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
          isEnabled
            ? 'border-white/10 bg-specimen-amber/20 text-lumen-amber'
            : 'border-white/10 bg-transparent text-mist-dim hover:bg-ridge hover:text-mist'
        }`}
      >
        <MicIcon />
        {t('cinema.voiceover.toggle')}
      </button>

      {isEnabled ? (
        <div className="flex flex-col gap-2">
          <textarea
            rows={2}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            maxLength={600}
            placeholder={t('cinema.voiceover.placeholder')}
            aria-label={t('cinema.voiceover.line')}
            className="resize-none rounded-lg border border-white/10 bg-steel px-3 py-2 text-sm text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
          />
          <Select
            label={t('cinema.voiceover.voice')}
            options={voices.map((value) => ({ value, label: value }))}
            value={voice}
            onChange={onVoiceChange}
          />
          <div className="flex items-center justify-between gap-3">
            {/* Voiced is a state, not a silence. Say it. */}
            <span className="text-xs text-mist-dim">
              {isVoiced ? t('cinema.voiceover.voiced') : t('cinema.voiceover.notVoiced')}
            </span>
            <Button
              variant="ghost"
              onClick={onGenerate}
              isLoading={isGenerating}
              disabled={text.trim().length < 2 || isGenerating}
            >
              <SparkIcon />
              {isVoiced
                ? t('cinema.voiceover.regenerate', { count: credits })
                : t('cinema.voiceover.generate', { count: credits })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
