// apps/web/src/modules/Soul/components/SoulStudio.tsx
// The /soul page body: build a character (constructor) · start from a ready-made
// one (prompt library) · open one you already made (characters).
//
// IT OWNS THE DRAFT, and that is the whole reason this component exists rather
// than the route composing three siblings: "open in constructor" is a write from
// the library INTO the constructor, so exactly one component must hold the state
// both of them touch.
//
// Creating a character spends NO credits — there is no generation here. The
// portraits (2 credits, then 8 each) live on the soul card, behind their own
// priced, confirmed buttons. Keeping the free act and the paid act on different
// screens is the cheapest possible protection against a 26-credit accident.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type { Soul } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useCreateSoul } from '../model/soulApi'
import { EMPTY_DRAFT } from '../model/soulDraft'
import type { SoulDraft } from '../model/soulDraft'
import { PromptLibrary } from './PromptLibrary'
import { SoulCharacters } from './SoulCharacters'
import { SoulConstructor } from './SoulConstructor'

export function SoulStudio() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<SoulDraft>(EMPTY_DRAFT)
  const createMutation = useCreateSoul()

  // A library entry lands in the draft WHOLE — soul and a suggested name. The
  // user is then free to edit every axis of it, which is the point of shipping
  // structure instead of a string.
  const openInConstructor = (soul: Soul, name: string) => {
    setDraft({ name, soul })
    // The constructor is above the library on mobile and beside it on desktop;
    // scrolling to the top is the honest "your draft changed" signal in both
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCreate = () => {
    createMutation.mutate(
      { kind: 'character', name: draft.name.trim(), soul: draft.soul },
      {
        // Straight into the soul card: the next act (the hero portrait) lives
        // there, and a character with no photos has nothing to show on this page
        onSuccess: (entity) =>
          void navigate({ to: '/soul/$entityId', params: { entityId: entity.id } }),
      },
    )
  }

  // Never the raw server text: the code maps to our own localized copy
  const createError =
    createMutation.error instanceof ApiClientError
      ? t(errorCodeMessageKey(createMutation.error.code))
      : createMutation.isError
        ? t('errors.actionFailed')
        : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal text-white">{t('soul.title')}</h1>
        <p className="max-w-2xl text-sm text-mist-dim">{t('soul.subtitle')}</p>
      </header>

      {/* Constructor first, library beside it: the library is a starting point, not
          the main act, so it takes the narrow rail */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SoulConstructor
          draft={draft}
          onChange={setDraft}
          onSubmit={handleCreate}
          submitLabel={t('soul.constructor.submit')}
          isSubmitting={createMutation.isPending}
          error={createError}
        />
        <PromptLibrary onOpen={openInConstructor} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-normal text-white">{t('soul.characters.title')}</h2>
        <SoulCharacters />
      </section>
    </div>
  )
}
