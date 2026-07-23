// apps/web/src/modules/Cinema/components/CinemaEditorHeader.tsx
// The CinemaStudio editor's OWN top bar — it REPLACES the global AppShell nav on
// /cinema/$filmId (owner request 2026-07-23).
//
// v2 "Собранный бар" (2026-07-23, owner "паттерны хромают"): the first pass read
// as a soup of controls — the aspect was three permanent toggles fighting the
// title, nothing was grouped, and no action dominated. This version applies the
// header-pattern laws recorded in design.md §13:
//   * ZONES with one rhythm: [back · title · meta] ......... [primary · ⋯ │ chrome].
//   * The title is the DOMINANT element (text-base white); the wordmark is gone —
//     it was noise on a focused screen, and `‹` back to the films list is the
//     escape hatch that matters here.
//   * Aspect is a CHIP-DROPDOWN (`16:9 ▾`) with a checked current value, NOT a
//     row of permanent toggles — a set-once property is a menu, not a mode switch.
//   * Film META (aspect · shot count · duration) sits under the title as quiet
//     mist-dim chips — context, not chrome.
//   * «Собрать mp4» is the ONE primary (green, icon-led) button, first in the
//     action cluster, so the film's main outcome reads first.
//   * A hairline DIVIDER separates the film actions from the injected global
//     `chrome` (balance · lang · account), which stays visually quieter.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Film } from '@opencreate/contracts'
import { aspectRatioSchema } from '@opencreate/contracts'
import type { ReactNode } from 'react'
import { Button, Menu, Modal, Skeleton } from 'shared/ui'
import { useDeleteFilm, useUpdateFilm } from '../model/filmsApi'
import { formatTimecode } from '../model/timelineGeometry'
import { FilmSettingsModal } from './FilmSettingsModal'
import { ChevronLeftIcon, PlayIcon } from './icons'

export type CinemaEditorHeaderProps = {
  // The loaded film, or undefined while the detail is still resolving — the bar
  // renders its chrome immediately (no pop-in) and shows a title Skeleton.
  film: Film | undefined
  // Kick off the mp4 export (owned by FilmEditor — the status strip and this
  // button must read ONE state). A visible primary button since 2026-07-23.
  onExport: () => void
  // False = the timeline has no shots OR a render is already in flight; the
  // button is DISABLED (not hidden — a header CTA that vanishes reads as a bug).
  canExport: boolean
  // True while the kick-off POST is in flight — the button shows its spinner.
  isStarting: boolean
  // Shot count + total duration for the film-META row (context chips under the
  // title). Undefined while the film loads; the meta is hidden until then.
  // Explicit `| undefined` because tsconfig has exactOptionalPropertyTypes — the
  // caller (FilmEditor) passes `data?.shots.length`, a real `number | undefined`.
  shotCount?: number | undefined
  durationMs?: number | undefined
  // balance · lang · account, injected by the route (this module can't import
  // modules/Auth or modules/Credits — see the file header).
  chrome?: ReactNode
}

export function CinemaEditorHeader({
  film,
  onExport,
  canExport,
  isStarting,
  shotCount,
  durationMs,
  chrome,
}: CinemaEditorHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteFilm = useDeleteFilm()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const confirmDelete = () => {
    if (!film) return
    deleteFilm.mutate(film.id, {
      onSuccess: () => {
        setIsConfirmOpen(false)
        void navigate({ to: '/cinema' })
      },
    })
  }

  return (
    // Full-bleed sticky steel bar, AppShell's 44px silhouette so the app reads as
    // one system even though this screen dropped the global nav.
    <header className="sticky top-0 z-40 bg-steel">
      <div className="flex w-full items-center gap-x-3 gap-y-1 px-6 py-1.5 xl:px-10">
        {/* LEFT ZONE — the escape hatch + the film's identity/context */}
        <Link
          to="/cinema"
          aria-label={t('cinema.editor.back')}
          title={t('cinema.editor.back')}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          <ChevronLeftIcon className="size-4" />
        </Link>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          {film ? (
            <>
              <FilmTitleField film={film} />
              {/* META — quiet context chips: aspect dropdown · N shots · m:ss */}
              <div className="flex items-center gap-2 text-xs text-mist-dim">
                <AspectChip film={film} />
                <MetaDot />
                <span>{t('cinema.header.shots', { count: shotCount ?? 0 })}</span>
                <MetaDot />
                <span className="tabular-nums">{formatTimecode(durationMs ?? 0)}</span>
              </div>
            </>
          ) : (
            // Title placeholder while the film loads — the bar keeps its height
            <Skeleton className="h-5 w-40" />
          )}
        </div>

        {/* RIGHT ZONE — the primary outcome + overflow, then the global chrome */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onExport}
            disabled={!canExport}
            isLoading={isStarting}
          >
            {!isStarting ? <PlayIcon className="size-3.5" /> : null}
            {t('cinema.render.cta')}
          </Button>

          {film ? (
            <Menu
              label={t('cinema.editor.filmMenu')}
              align="end"
              items={[
                {
                  id: 'settings',
                  label: t('cinema.editor.rename'),
                  onSelect: () => setIsSettingsOpen(true),
                },
                {
                  id: 'delete',
                  label: t('cinema.editor.deleteFilm'),
                  variant: 'danger',
                  onSelect: () => setIsConfirmOpen(true),
                },
              ]}
              triggerClassName="flex size-8 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <span aria-hidden="true">⋯</span>
            </Menu>
          ) : null}

          {/* Hairline divider — film actions on the left of it, global chrome on
              the right, so the two never read as one flat row of equals. */}
          {chrome ? <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/10" /> : null}
          {chrome}
        </div>
      </div>

      {film ? (
        <>
          {/* Style default + a full rename/aspect form still reachable in edit mode */}
          <FilmSettingsModal
            film={film}
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />

          {/* Destructive confirm: the mutation fires only on the danger pill (§9) */}
          <Modal
            isOpen={isConfirmOpen}
            onClose={() => setIsConfirmOpen(false)}
            title={t('cinema.editor.deleteConfirm.title')}
            role="alertdialog"
          >
            <div className="flex flex-col gap-5">
              <p className="text-mist">
                {t('cinema.editor.deleteConfirm.body', { title: film.title })}
              </p>
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" onClick={confirmDelete} isLoading={deleteFilm.isPending}>
                  {t('cinema.editor.deleteConfirm.confirm')}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      ) : null}
    </header>
  )
}

// A quiet middot separating the film-meta chips
function MetaDot() {
  return (
    <span aria-hidden="true" className="text-mist-dim/50">
      ·
    </span>
  )
}

type FilmFieldProps = {
  // The film whose title/aspect this control edits in place
  film: Film
}

// The film title AS an inline-editable h1 — the DOMINANT element of the bar. A
// button showing the title flips to a text input on click; Enter or blur commits
// a non-empty change, Escape reverts. Keeps the page's single h1 landmark.
function FilmTitleField({ film }: FilmFieldProps) {
  const { t } = useTranslation()
  const update = useUpdateFilm()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(film.title)

  const label = t('cinema.editor.titleLabel')

  const startEditing = () => {
    // Re-seed from the current title so a prior cancelled edit never leaks back
    setDraft(film.title)
    setIsEditing(true)
  }

  const commit = () => {
    setIsEditing(false)
    const next = draft.trim()
    // Empty is not a valid film title (contract min 1) — treat it as a cancel;
    // an unchanged value skips the needless PATCH.
    if (next.length > 0 && next !== film.title) {
      update.mutate({ filmId: film.id, input: { title: next } })
    }
  }

  return (
    <h1 className="min-w-0">
      {isEditing ? (
        <input
          // autoFocus is deliberate: the click that opens this field IS the
          // user's intent to type into it (rename gesture), not a focus steal.
          autoFocus
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setIsEditing(false)
          }}
          className="min-w-0 max-w-[36vw] rounded-lg border border-white/10 bg-steel px-2 py-1 text-base font-medium text-white focus-visible:border-portal focus-visible:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          aria-label={`${label}: ${film.title}`}
          className="block max-w-[36vw] truncate rounded-lg px-1 text-base font-medium text-white transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {film.title}
        </button>
      )}
    </h1>
  )
}

// The canvas aspect as a CHIP-DROPDOWN — a set-once property is a menu, not a
// row of permanent toggles (design.md §13). The trigger shows the current ratio;
// the popup lists all three with the active one checked; picking one PATCHes.
function AspectChip({ film }: FilmFieldProps) {
  const { t } = useTranslation()
  const update = useUpdateFilm()

  const change = (aspectRatio: AspectRatio) => {
    if (aspectRatio !== film.aspectRatio) {
      update.mutate({ filmId: film.id, input: { aspectRatio } })
    }
  }

  return (
    <Menu
      label={t('cinema.settings.aspect')}
      align="start"
      items={aspectRatioSchema.options.map((option) => ({
        id: option,
        label: option,
        // Leading check on the current value keeps consistent item alignment via
        // a same-size spacer on the others — the "which is selected" the first
        // pass lacked.
        icon:
          option === film.aspectRatio ? (
            <CheckIcon className="size-4 text-glow-amber" />
          ) : (
            <span className="size-4" />
          ),
        onSelect: () => change(option),
      }))}
      triggerClassName="inline-flex min-h-6 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium text-mist transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
    >
      <span className="tabular-nums">{film.aspectRatio}</span>
      <span aria-hidden="true" className="text-mist-dim/70">
        ▾
      </span>
    </Menu>
  )
}

// A simple check glyph for the selected menu value (currentColor, no emoji)
function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}
