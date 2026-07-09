// apps/web/src/modules/Cinema/components/AudioTracks.tsx
// The secondary audio rail: add a music bed or a voiceover (generate the audio
// clip + link it as a film track, in one action), and list existing tracks with
// a remove control. Kept compact — the render mixes the audio; this surface only
// composes the tracklist. A mini-form opens per kind (prompt + optional voice).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioKind, CatalogAudioModel, FilmAudio } from '@opencreate/contracts'
import { Button, Select } from 'shared/ui'
import { useAddAudioTrack, useDeleteAudio } from '../model/audioApi'
import { MicIcon, MusicIcon, TrashIcon } from './icons'

export type AudioTracksProps = {
  filmId: string
  audio: FilmAudio[]
  // Audio catalog models — one music model, one tts model (may be empty)
  audioModels: CatalogAudioModel[]
}

export function AudioTracks({ filmId, audio, audioModels }: AudioTracksProps) {
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
    setPrompt('')
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

  return (
    <section aria-label={t('cinema.audio.title')} className="flex flex-col gap-3">
      <h2 className="text-sm text-mist-dim">{t('cinema.audio.title')}</h2>

      {/* Existing tracks */}
      {audio.length === 0 ? (
        <p className="text-xs text-mist-dim">{t('cinema.audio.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10">
          {audio.map((track) => (
            <li key={track.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-mist">
                {track.kind === 'music' ? <MusicIcon /> : <MicIcon />}
                {t(`cinema.audio.kind.${track.kind}`)}
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
          ))}
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
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              openKind === 'voiceover'
                ? t('cinema.audio.voicePlaceholder')
                : t('cinema.audio.musicPlaceholder')
            }
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
      )}
    </section>
  )
}
