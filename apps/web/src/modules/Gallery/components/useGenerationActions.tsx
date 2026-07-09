// apps/web/src/modules/Gallery/components/useGenerationActions.tsx
// THE action set for one generation — the single source of truth for what a user
// can do with a result, and under what conditions.
//
// WHY A MODULE AND NOT INLINE BUTTONS: the same four actions surface in two very
// different shapes — the card's overflow menu (rows of text) and the detail
// view's icon rail. If each rendered its own list, they would drift: an action
// added to one, an availability rule fixed in the other, and eventually Download
// appears on a failed generation in exactly one place. Here, availability and
// behaviour are decided once; the two views only choose how to paint them.
//
// It also owns the two pieces of state an action can carry: the delete
// confirmation dialog (a paid generation never dies in one click) and the
// transient "copied" flash on the prompt action.
//
// EXTENDING: add an entry to the returned array. Give it `isAvailable` if it
// only applies to some generations, `variant: 'danger'` if it destroys work.
// Both views pick it up with no further change — that is the point of this file.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Button, Modal } from 'shared/ui'
import type { MenuItem } from 'shared/ui'
import { useDeleteGeneration } from '../model/generationsApi'
import { CheckIcon, DownloadIcon, PromptIcon, RegenerateIcon, TrashIcon } from './icons'

export type UseGenerationActionsArgs = {
  generation: Generation
  // Refill the composer from this generation and let the user tweak + resubmit.
  // Injected by the route: Gallery must not import the Generator's draft store
  // (cross-module import). Omitted on screens with no composer (/library), where
  // the action simply does not appear.
  onRegenerate?: (generation: Generation) => void
}

// How long the prompt action shows its "copied" check before reverting
const COPIED_FLASH_MS = 1600

export function useGenerationActions({ generation, onRegenerate }: UseGenerationActionsArgs) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteGeneration()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A pending timer must not fire into an unmounted component (the card can be
  // deleted, or the grid re-filtered, while the flash is still showing)
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  const mediaUrl = generation.mediaUrls[0]
  const isSucceeded = generation.status === 'succeeded'

  const copyPrompt = () => {
    // The clipboard API can FAIL in three ways, and each must be swallowed here:
    //  · absent entirely (insecure origin, old browser) → optional-chain guard
    //  · present but rejects (permission denied, document not focused)
    //  · resolves → show the check
    // The .catch is load-bearing: without it a denied write becomes an unhandled
    // promise rejection, which surfaces as a page-level error. Failing quietly is
    // the right call for a convenience action — there is no recovery to offer,
    // and a red banner over the user's artwork would be wildly disproportionate.
    // We simply do not flash "Copied" for something that was not copied.
    void navigator.clipboard
      ?.writeText(generation.prompt)
      .then(() => {
        setIsCopied(true)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setIsCopied(false), COPIED_FLASH_MS)
      })
      .catch(() => {
        // Intentionally silent — see above
      })
  }

  const download = () => {
    if (!mediaUrl) return
    // A programmatic <a download> click: the action list is shared with the menu,
    // whose items are <button>s, so a real anchor cannot be the trigger here.
    const anchor = document.createElement('a')
    anchor.href = mediaUrl
    anchor.download = ''
    anchor.click()
  }

  const actions: MenuItem[] = [
    {
      id: 'regenerate',
      label: t('gallery.actions.regenerate'),
      icon: <RegenerateIcon />,
      // No composer on this screen, or nothing to re-run
      isAvailable: Boolean(onRegenerate),
      onSelect: () => onRegenerate?.(generation),
    },
    {
      id: 'prompt',
      label: isCopied ? t('gallery.actions.promptCopied') : t('gallery.actions.prompt'),
      icon: isCopied ? <CheckIcon /> : <PromptIcon />,
      onSelect: copyPrompt,
    },
    {
      id: 'download',
      // Nothing to download until the media exists
      isAvailable: isSucceeded && Boolean(mediaUrl),
      label: t('gallery.download'),
      icon: <DownloadIcon />,
      onSelect: download,
    },
    {
      id: 'delete',
      label: t('gallery.delete'),
      icon: <TrashIcon />,
      variant: 'danger',
      // The action NEVER deletes — it only asks the question
      onSelect: () => setIsConfirmOpen(true),
    },
  ]

  // Rendered by whichever view uses the actions. Returned as an element rather
  // than left to the caller, so no caller can forget the confirmation step.
  const confirmDialog = (
    <Modal
      isOpen={isConfirmOpen}
      onClose={() => setIsConfirmOpen(false)}
      title={t('gallery.deleteConfirm.title')}
      role="alertdialog"
    >
      <div className="flex flex-col gap-6">
        {/* Terminal voice: one quiet sentence states the consequence —
            permanence is the fact being confirmed, not a scare line */}
        <p className="text-sm leading-relaxed text-mist">{t('gallery.deleteConfirm.description')}</p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
            {t('gallery.deleteConfirm.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              // Close first: the optimistic removal makes the card vanish right
              // after, and a dialog unmounting with its parent looks like a glitch
              setIsConfirmOpen(false)
              deleteMutation.mutate(generation.id)
            }}
          >
            {t('gallery.deleteConfirm.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  )

  return { actions, confirmDialog, isDeleting: deleteMutation.isPending } as const
}
