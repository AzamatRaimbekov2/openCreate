// apps/web/src/modules/Soul/components/PromptLibrary.tsx
// The ready-made characters. The owner asked for "a list of prompts you can
// copy"; the ADR gave each entry as a Soul LITERAL instead of a string, so this
// component can offer BOTH — the copyable text AND "open in constructor" — and
// the second one is free precisely because we never threw the structure away.
//
// The text shown is the composed prompt (soulPresentation), not a stored blob: it
// is regenerated from the same tables the API composes from, so a fragment edit in
// contracts updates every library card without touching this file.
import { useTranslation } from 'react-i18next'
import { PROMPT_LIBRARY } from '@opencreate/contracts'
import type { Soul } from '@opencreate/contracts'
import { Button, Card } from 'shared/ui'
import { composeSoulPreview } from '../model/soulPresentation'
import { CopyButton } from './CopyButton'

export type PromptLibraryProps = {
  // Load a ready-made character into the constructor's draft (the studio owns it)
  onOpen: (soul: Soul, name: string) => void
}

export function PromptLibrary({ onOpen }: PromptLibraryProps) {
  const { t } = useTranslation()

  return (
    <Card surface="glass" padding="lg" title={t('soul.library.title')}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-mist-dim">{t('soul.library.description')}</p>
        <ul className="flex flex-col gap-3">
          {PROMPT_LIBRARY.map((entry) => {
            const { positivePrompt } = composeSoulPreview(entry.soul)
            return (
              <li key={entry.id}>
                {/* Recessed well: the prompt text is machine text, one step under
                    the panel that lists it */}
                <Card surface="well" padding="md">
                  <div className="flex flex-col gap-2">
                    {/* Entry labels are contract DATA (already Russian) — the same
                        convention as the option tables, not app copy */}
                    <p className="text-sm font-medium text-white">{entry.label}</p>
                    {/* Clamped: the full text is one Copy away, and a 400-character
                        paragraph per card would bury the eight characters */}
                    <p className="line-clamp-3 text-xs leading-relaxed text-mist-dim">
                      {positivePrompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyButton text={positivePrompt} />
                      <Button variant="ghost" onClick={() => onOpen(entry.soul, entry.label)}>
                        {t('soul.library.open')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
