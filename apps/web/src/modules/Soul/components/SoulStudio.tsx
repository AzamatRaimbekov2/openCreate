// apps/web/src/modules/Soul/components/SoulStudio.tsx
// The /soul page body: a 3-ZONE STUDIO (2026-07-21 recomposition, owner-approved)
// mirroring an "AI Influencer Studio" — a viewport-height WORKBENCH like the
// cinema editor, not a form-first vertical stack:
//
//   LEFT RAIL   — a "＋ new character" reset + the user's characters as a compact
//                 rail (SoulCharacters variant="rail", 4 states). Each is a Link
//                 into /soul/$entityId, where the PAID portrait sheet lives — the
//                 studio never inlines minting.
//   CENTER STAGE— the live draft (SoulStage): a "start building" placeholder while
//                 pristine, then the composed "what the model will see" + the
//                 picked axis/trait chips. The honest analog of a center preview
//                 for a character whose face is minted LATER, for credits.
//   RIGHT BUILDER— the character builder (SoulBuilder): the required + optional
//                 axes and traits, plus a "start from a preset" shortcut folding
//                 in the old PromptLibrary.
//   BOTTOM DOCK — the ONE create action (SoulComposer), position:fixed like the
//                 cinema dock: the name field, a shuffle dice, the single green
//                 "Create character" pill.
//
// IT STILL OWNS THE DRAFT — the whole reason this is one component and not four
// route siblings. A preset write, a shuffle, a reset and a name keystroke all
// mutate the ONE draft the stage, the builder and the composer read. Creating a
// character spends NO credits; the priced portraits live on the soul card behind
// their own confirmed buttons — keeping the free act and the paid act on
// different screens is the cheapest protection against a 26-credit accident.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type { Soul } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useCreateSoul } from '../model/soulApi'
import { EMPTY_DRAFT, isDraftReady } from '../model/soulDraft'
import type { SoulDraft } from '../model/soulDraft'
import { randomizeDraft } from '../model/randomizeDraft'
import { SoulBuilder } from './SoulBuilder'
import { SoulCharacters } from './SoulCharacters'
import { SoulComposer } from './SoulComposer'
import { SoulStage } from './SoulStage'

// The workbench fills the viewport under the 44px app bar + the route's 16px
// paddings — no page scroll on DESKTOP: each zone scrolls inside itself and the
// composer is a fixed dock (pb-28 leaves exactly its collapsed clearance). Below
// `lg` the zones STACK and the page scrolls normally — a viewport-locked 3-column
// grid is unusable at 390px, so the workbench posture is desktop-first.
const STUDIO_LAYOUT = 'flex flex-col gap-3 pb-28 lg:h-[calc(100svh-76px)] lg:min-h-0 lg:flex-row'

// Mobile order is rail → builder → stage (build first, preview last); desktop
// re-slots the stage into the middle: rail | stage | builder.
const RAIL_ZONE = 'order-1 flex w-full flex-col gap-3 lg:w-60 lg:shrink-0 lg:overflow-y-auto'
const STAGE_ZONE = 'order-3 min-w-0 lg:order-2 lg:flex-1 lg:overflow-y-auto'
const BUILDER_ZONE = 'order-2 w-full lg:order-3 lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto'

export function SoulStudio() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<SoulDraft>(EMPTY_DRAFT)
  const createMutation = useCreateSoul()

  // A preset (or a "create new" reset) REPLACES the whole draft — the reason this
  // component owns it: the builder and the composer both edit what a preset write
  // lands here.
  const openPreset = (soul: Soul, name: string) => setDraft({ name, soul })
  const resetDraft = () => setDraft(EMPTY_DRAFT)

  // Shuffle randomizes the LOOK but keeps the name the user already typed — a
  // dice press should not wipe a name (randomizeDraft returns an empty one).
  const handleShuffle = () => setDraft((prev) => ({ ...randomizeDraft(), name: prev.name }))

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
    <>
      <div className={STUDIO_LAYOUT}>
        {/* LEFT RAIL — reset + the character rail */}
        <aside className={RAIL_ZONE}>
          <button
            type="button"
            onClick={resetDraft}
            className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-mist transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {/* Decorative plus — a typographic glyph, not an emoji */}
            <span aria-hidden="true" className="text-lg leading-none text-portal">
              +
            </span>
            {t('soul.rail.createNew')}
          </button>

          <h2 className="px-1 text-xs text-mist-dim">{t('soul.characters.title')}</h2>
          <SoulCharacters variant="rail" />
        </aside>

        {/* CENTER STAGE — the live draft */}
        <section className={STAGE_ZONE} aria-label={t('soul.stage.title')}>
          <SoulStage draft={draft} />
        </section>

        {/* RIGHT BUILDER — the axes + preset shortcut */}
        <aside className={BUILDER_ZONE}>
          <SoulBuilder
            soul={draft.soul}
            onChange={(soul) => setDraft((prev) => ({ ...prev, soul }))}
            onPreset={openPreset}
          />
        </aside>
      </div>

      {/* THE DOCK — position:fixed to the viewport bottom, mirroring the cinema
          editor: the create action must not consume workbench height, so it
          floats. The wrapper is click-through with the route's horizontal padding
          so the capsule stays aligned to the column edges; z-40 floats over the
          workbench but under Modal's z-50 (the preset sheet). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 xl:px-6">
        <div className="pointer-events-auto">
          <SoulComposer
            name={draft.name}
            onNameChange={(name) => setDraft((prev) => ({ ...prev, name }))}
            onShuffle={handleShuffle}
            onCreate={handleCreate}
            isCreating={createMutation.isPending}
            canCreate={isDraftReady(draft)}
            error={createError}
          />
        </div>
      </div>
    </>
  )
}
