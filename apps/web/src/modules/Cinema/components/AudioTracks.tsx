// apps/web/src/modules/Cinema/components/AudioTracks.tsx
// The secondary audio rail: add a music bed or a voiceover (generate the audio
// clip + link it as a film track, in one action), and list existing tracks with
// a remove control. Kept compact — the render mixes the audio; this surface only
// composes the tracklist. A mini-form opens per kind (prompt + optional voice).
//
// v4 hierarchy: a TITLED `Card surface="steel"`. Steel is flat — no specular
// edge, no shadow — which is exactly the point: audio is supporting data under
// the stage and the export action, and it should recede next to them. The card's
// `title` also makes it a labelled region, so a screen-reader user can jump
// straight to "Audio" instead of scanning the editor.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioKind, CatalogAudioModel, FilmAudio } from '@opencreate/contracts'
import { Button, Card, Select } from 'shared/ui'
import { useAddAudioTrack, useDeleteAudio } from '../model/audioApi'
import { MicIcon, MusicIcon, TrashIcon } from './icons'

export type AudioTracksProps = {
  filmId: string
  audio: FilmAudio[]
  // Audio catalog models — one music model, one tts model (may be empty)
  audioModels: CatalogAudioModel[]
  // The music bed the film's template recommends, resolved at the route from
  // film.templateId (null for a hand-made film). It PRE-FILLS the music form.
  //
  // This is the quiet payoff of the template catalog. "Melancholic soap-opera
  // strings, dramatic piano, slow and heavy" is not a thing a user thinks to
  // write — it is a thing someone who has watched a hundred of these videos
  // knows. Handing it over as an editable default costs nothing and is most of
  // the difference between a film that sounds like the format and one that
  // doesn't.
  musicPrompt?: string | null
  // The film's shot ids, in timeline order. Used ONLY to name a track: a
  // shot-attached voiceover reads "Реплика · бит 4" instead of an eighth
  // identical "Озвучка" row. A drama has eight of these; without the beat number
  // the list is unreadable and the remove buttons are a guessing game.
  shotIds?: string[]
}

export function AudioTracks({
  filmId,
  audio,
  audioModels,
  musicPrompt = null,
  shotIds = [],
}: AudioTracksProps) {
  const { t } = useTranslation()
  const addTrack = useAddAudioTrack()
  const deleteAudio = useDeleteAudio()

  const musicModel = audioModels.find((model) => model.audioKind === 'music')
  const ttsModel = audioModels.find((model) => model.audioKind === 'tts')

  // Which mini-form is open (null = none); prompt + voice are its fields
  const [openKind, setOpenKind] = useState<AudioKind | null>(null)
  const [prompt, setPrompt] = useState('')
  const [voice, setVoice] = useState('')

  const activeModel = openKind === 'voiceover' ? ttsModel : musicModel
  const voices = ttsModel?.voices ?? []

  const open = (kind: AudioKind) => {
    setOpenKind(kind)
    // The template's suggestion is a DEFAULT, not a decision — it lands in the
    // field, where the user can rewrite or clear it before spending anything.
    setPrompt(kind === 'music' ? (musicPrompt ?? '') : '')
    setVoice(voices[0] ?? '')
  }

  const submit = () => {
    if (!openKind || !activeModel || prompt.trim().length < 2) return
    addTrack.mutate(
      {
        filmId,
        kind: openKind,
        modelId: activeModel.id,
        prompt: prompt.trim(),
        ...(openKind === 'voiceover' && voice ? { voice } : {}),
      },
      { onSuccess: () => setOpenKind(null) },
    )
  }

  const promptPlaceholder =
    openKind === 'voiceover'
      ? t('cinema.audio.voicePlaceholder')
      : t('cinema.audio.musicPlaceholder')

  return (
    <Card surface="steel" title={t('cinema.audio.title')}>
      <div className="flex flex-col gap-3">
        {/* Existing tracks */}
        {audio.length === 0 ? (
          <p className="text-xs text-mist-dim">{t('cinema.audio.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10">
            {audio.map((track) => {
              // A shot-attached line is named by the beat it voices. -1 → the shot
              // was deleted out from under the track; it still plays (the render
              // mixes by startMs, not by shot), so name it honestly rather than
              // hiding it.
              const beat = track.shotId ? shotIds.indexOf(track.shotId) : -1
              return (
              <li key={track.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-mist">
                  {track.kind === 'music' ? <MusicIcon /> : <MicIcon />}
                  {beat >= 0
                    ? t('cinema.audio.shotLine', { beat: beat + 1 })
                    : t(`cinema.audio.kind.${track.kind}`)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteAudio.mutate({ filmId, audioId: track.id })}
                  aria-label={t('cinema.audio.remove')}
                  className="grid size-8 place-items-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-glow-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
                >
                  <TrashIcon />
                </button>
              </li>
              )
            })}
          </ul>
        )}

        {/* Add controls / mini-form */}
        {openKind === null ? (
          <div className="flex flex-wrap gap-2">
            {musicModel ? (
              <Button variant="ghost" onClick={() => open('music')}>
                <MusicIcon />
                {t('cinema.audio.addMusic')}
              </Button>
            ) : null}
            {ttsModel ? (
              <Button variant="ghost" onClick={() => open('voiceover')}>
                <MicIcon />
                {t('cinema.audio.addVoice')}
              </Button>
            ) : null}
            {!musicModel && !ttsModel ? (
              <p className="text-xs text-mist-dim">{t('cinema.audio.unavailable')}</p>
            ) : null}
          </div>
        ) : (
          // The mini-form is a recessed plate INSIDE the card — a well, so it
          // reads as a drawer that opened, not as a second panel.
          <Card surface="well">
            <div className="flex flex-col gap-2">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={promptPlaceholder}
                aria-label={promptPlaceholder}
                className="rounded-lg border border-white/10 bg-steel px-3 py-2 text-sm text-mist placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
              />
              {openKind === 'voiceover' && voices.length > 0 ? (
                <Select
                  label={t('cinema.audio.voice')}
                  options={voices.map((value) => ({ value, label: value }))}
                  value={voice}
                  onChange={setVoice}
                />
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpenKind(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={submit}
                  isLoading={addTrack.isPending}
                  disabled={prompt.trim().length < 2 || addTrack.isPending}
                >
                  {t('cinema.audio.generate')}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Card>
  )
}
