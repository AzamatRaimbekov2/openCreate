// apps/web/src/modules/Cinema/components/ShotReferenceImages.tsx
// Attach ANY image to a shot as a generation reference — the fix for the owner's
// complaint that "attach" only offered character tagging and could not take a
// drag-drop or a pasted screenshot. It sits ALONGSIDE ShotCastField in the cast
// drawer: that control TAGS a known character (the fox is the same fox across
// shots); this one attaches an arbitrary "make it look like these" picture.
//
// THREE upload inputs, ONE gate: click-to-upload, drag-and-drop onto this area,
// and paste (Cmd/Ctrl+V of a screenshot) all route the file through the shared
// readImageFile gate (shared/libs — one type/size check for the whole app) and
// then POST the data URI. The just-attached thumbnail renders from the server
// /media path off the refetched shot (the add hook invalidates the film detail),
// never the client data URI — the path is the honest source of truth and is what
// the model will actually receive at generate time.
//
// A FOURTH source, "attach from gallery" (ShotGalleryPicker): the user picks one
// of their OWN finished images. That media is already ours and was validated when
// it was generated, so it does NOT re-run readImageFile — instead we fetch the
// /media bytes → read them into a data URI → hit the identical add path. So a
// gallery pick and a file upload land as the same request; no new endpoint, no
// client-trusted URL on the wire.
//
// THE SHARED BUDGET OF 5: entity tags + attached images cap at
// MAX_SHOT_REFERENCE_IMAGES together (Wan 2.7 r2v's own ceiling). We disable the
// add affordance at the cap; the API enforces it too and a 400 becomes localized
// copy — never raw server text (design.md §9).
//
// PASTE SCOPING: the paste handler lives on THIS region (React onPaste), so it
// only fires when the reference area (or a child) is focused — a Cmd+V into the
// prompt textarea or anywhere else on the page is never hijacked. Being element-
// scoped, there is NO document listener to leak.
//
// NO MODEL-GATING COPY (owner request 2026-07-24): we never tell the user "this
// model doesn't use reference images / switch to Wan". Attaching is always
// available; whether the refs reach the provider is the money path's decision
// (composeShotClipInput drops them silently, no charge, for a model without
// referenceMode) — the UI just lets the user attach and stays quiet.
//
// MAKE-CHARACTER BRIDGE (2026-07-24): each attached thumbnail carries a second,
// quiet affordance — turn THIS picture into a named, reusable character. It opens
// MakeCharacterModal, which (via makeCharacterApi) creates an Entity and attaches
// the picture as its reference photo. On success we do three things here, because
// they are shot-level: DELETE the raw ref (so the same image is not sent twice —
// once anonymously and once as the character's photo), call onCharacterCreated so
// the composer auto-@mentions the fresh character, and toast the confirmation.
// The entity system is reused as-is; there is NO backend change.
import { useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_SHOT_REFERENCE_IMAGES } from '@opencreate/contracts'
import type { ShotReferenceImage } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { blobToDataUri } from 'shared/libs/blobToDataUri'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { readImageFile } from 'shared/libs/readImageFile'
import { Card, Skeleton, toast } from 'shared/ui'
import { useAddShotReference, useDeleteShotReference } from '../model/shotReferencesApi'
import { MakeCharacterModal } from './MakeCharacterModal'
import { ShotGalleryPicker } from './ShotGalleryPicker'
import { PersonIcon } from './icons'

export type ShotReferenceImagesProps = {
  filmId: string
  // The shot these images hang on
  shotId: string
  // Already-attached images (server /media paths), from the refetched shot. Never
  // null on the wire, so no null-check before mapping.
  references: ShotReferenceImage[]
  // LIVE tagged-character count — shares the budget of 5 with the images, so the
  // "N / 5" and the cap reflect what ShotCastField shows in the same drawer.
  entityRefCount: number
  // Auto-@mention a freshly-made character: called with the new entity id after
  // "make character" succeeds. Wired to ShotInspector.addCharacter, which appends
  // the entity's [[eN]] token to the prompt and registers the mention.
  onCharacterCreated: (entityId: string) => void
}

export function ShotReferenceImages({
  filmId,
  shotId,
  references,
  entityRefCount,
  onCharacterCreated,
}: ShotReferenceImagesProps) {
  const { t } = useTranslation()
  const add = useAddShotReference()
  const del = useDeleteShotReference()
  const inputRef = useRef<HTMLInputElement>(null)
  // Client-side reject (type/size) from the shared gate, held as an i18n KEY so a
  // language switch re-localizes a visible error. Distinct from a server 400.
  const [localErrorKey, setLocalErrorKey] = useState<string | null>(null)
  // Drag-over highlight only — never a layout shift, just a portal ring
  const [isDragging, setIsDragging] = useState(false)
  // "Attach from gallery" modal visibility. The picker is mounted ONLY while
  // this is true, so its generations query is lazy (mounting this control fires
  // no gallery request; the sibling shot tests stay untouched).
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  // The reference currently being turned into a character (null = the make-
  // character modal is closed). Holding the whole ref, not just its id, keeps its
  // /media path for the modal preview and its id for the post-success delete.
  const [characterRef, setCharacterRef] = useState<ShotReferenceImage | null>(null)

  const used = entityRefCount + references.length
  const atCap = used >= MAX_SHOT_REFERENCE_IMAGES

  // The one path every input funnels through: validate + read, then POST. A
  // rejected file sets the notice and fires NO request (the API never sees it).
  const acceptFile = async (file: File) => {
    const result = await readImageFile(file)
    if (!result.ok) {
      setLocalErrorKey(result.errorKey)
      return
    }
    setLocalErrorKey(null)
    add.mutate({ filmId, shotId, dataUri: result.dataUri })
  }

  // Gallery pick: the URL is one of the user's OWN /media images. Pull the
  // bytes, read them into a data URI, and POST through the very same add path —
  // so the picker never needs its own endpoint and no client-trusted URL reaches
  // the wire. A failed fetch/read reuses the ONE localized notice the region
  // already renders (galleryError = "couldn't load that image").
  const handlePickFromGallery = async (url: string) => {
    setIsPickerOpen(false)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`media fetch ${response.status}`)
      const dataUri = await blobToDataUri(await response.blob())
      setLocalErrorKey(null)
      add.mutate({ filmId, shotId, dataUri })
    } catch {
      // Never surface the raw fetch/read error — one calm, localized line.
      setLocalErrorKey('cinema.shotRef.galleryError')
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first so re-picking the same file fires change again
    event.target.value = ''
    if (file) void acceptFile(file)
  }

  // Paste is scoped to this focused region (see header). A text paste carries no
  // FILE, so it falls through untouched; a pasted file is handed to the ONE gate
  // (readImageFile), which decides image-vs-not — never a second type check here.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (atCap || add.isPending) return
    const file = event.clipboardData?.files?.[0]
    if (!file) return
    event.preventDefault()
    void acceptFile(file)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // preventDefault is what makes this element a valid drop target
    event.preventDefault()
    if (!atCap) setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (atCap || add.isPending) return
    // The first dropped file goes straight to the ONE gate — a non-image is
    // rejected THERE (with a localized notice), not silently swallowed here.
    const file = event.dataTransfer.files[0]
    if (file) void acceptFile(file)
  }

  // Newest failure across the two mutations, mapped to a localized key. A client
  // reject (localErrorKey) wins because it is the more recent, more specific act.
  const mutationError = add.error ?? del.error
  const mutationErrorCode =
    mutationError instanceof ApiClientError
      ? mutationError.code
      : mutationError
        ? 'internal_error'
        : null
  const noticeKey =
    localErrorKey ?? (mutationErrorCode ? errorCodeMessageKey(mutationErrorCode) : null)

  return (
    // A focusable region so a paste lands in scope (tabIndex) and a drop has a
    // target. role=group + aria-label name it for AT and for the tests.
    <div
      role="group"
      aria-label={t('cinema.shotRef.title')}
      tabIndex={0}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col gap-2 rounded-xl outline-none transition-shadow duration-200 ${
        isDragging ? 'ring-2 ring-portal' : 'focus-visible:ring-2 focus-visible:ring-portal'
      }`}
    >
      {/* The shared budget, spoken as "N / 5" (the section title is the drawer's
          own legend). Amber when full so the number reads as the reason the add
          tile is gone, not a glitch. */}
      <div className="flex items-center justify-end">
        <span className={`text-xs ${atCap ? 'text-lumen-amber' : 'text-mist-dim'}`}>
          {used} / {MAX_SHOT_REFERENCE_IMAGES}
        </span>
      </div>

      {/* The thumbnail grid + the add tile. Media sits in a `well` Card (the
          recessed plate reserved for user media, design.md) — never frosted. */}
      <div className="flex flex-wrap gap-2">
        {references.map((ref) => (
          <div key={ref.id} className="relative">
            <Card surface="well" padding="none" className="size-16 overflow-hidden">
              <img
                src={ref.path}
                alt={t('cinema.shotRef.previewAlt')}
                className="size-full object-cover"
              />
            </Card>
            <button
              type="button"
              onClick={() => del.mutate({ filmId, shotId, refId: ref.id })}
              aria-label={t('cinema.shotRef.remove')}
              // Red = destructive (the triad). Overhangs the plate so it never
              // shrinks below the hit floor or covers the image.
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-specimen-red/80 text-[10px] leading-none text-lumen-red transition-colors duration-200 hover:bg-specimen-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              ✕
            </button>
            {/* Make-character: the quiet neutral counterpart to the red remove,
                on the OPPOSITE (bottom-left) corner so the two hit targets never
                overlap. Always offered — converting swaps a raw ref for a tag, so
                it is budget-neutral and stays available even at the cap. */}
            <button
              type="button"
              onClick={() => setCharacterRef(ref)}
              aria-label={t('cinema.shotRef.makeCharacter')}
              className="absolute -bottom-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-steel text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <PersonIcon className="size-3" />
            </button>
          </div>
        ))}

        {/* Loading: the in-flight upload as a pulsing plate at the well's radius,
            replaced by the real /media thumbnail when the refetch lands. */}
        {add.isPending ? <Skeleton className="size-16 rounded-2xl" /> : null}

        {/* Add tile — a real <label> wrapping a sr-only input (CreateAssetModal's
            pattern): the input carries the accessible name, the label is the
            click target and the picker trigger. Hidden at the cap. */}
        {!atCap ? (
          <label className="grid size-16 cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-white/5 focus-within:ring-2 focus-within:ring-portal">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              aria-label={t('cinema.shotRef.add')}
              className="sr-only"
              onChange={handleInputChange}
            />
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
          </label>
        ) : null}

        {/* Gallery trigger — same dashed tile as "+", opens the picker of the
            user's own images. Icon-only, so the aria-label carries the full
            intent. Hidden at the cap exactly like the add tile. */}
        {!atCap ? (
          <button
            type="button"
            onClick={() => setIsPickerOpen(true)}
            aria-label={t('cinema.shotRef.gallery')}
            className="grid size-16 cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ▦
            </span>
          </button>
        ) : null}
      </div>

      {/* Empty: no images yet and room to add — the discoverability hint that
          names all three gestures (click / drop / paste). */}
      {references.length === 0 && !atCap ? (
        <p className="text-xs text-mist-dim/70">{t('cinema.shotRef.hint')}</p>
      ) : null}

      {/* Error: a client reject or a server 400, always localized, never raw. */}
      {noticeKey ? (
        <p role="alert" className="text-xs text-glow-red">
          {t(noticeKey)}
        </p>
      ) : null}

      {/* Mounted only while open, so the gallery query is lazy. void() the async
          pick: its outcome surfaces through mutation state, not the click. */}
      {isPickerOpen ? (
        <ShotGalleryPicker
          onClose={() => setIsPickerOpen(false)}
          onPick={(url) => void handlePickFromGallery(url)}
        />
      ) : null}

      {/* Make-character dialog — mounted only while a ref is selected. On success
          the shot-level effects live HERE (the modal only creates the entity):
          drop the raw ref so the image is not sent twice, auto-@mention the new
          character, confirm with a toast, then close. */}
      {characterRef ? (
        <MakeCharacterModal
          imageUrl={characterRef.path}
          onClose={() => setCharacterRef(null)}
          onCreated={(entityId) => {
            del.mutate({ filmId, shotId, refId: characterRef.id })
            onCharacterCreated(entityId)
            toast.success({ title: t('cinema.shotRef.makeCharacterDone') })
            setCharacterRef(null)
          }}
        />
      ) : null}
    </div>
  )
}
