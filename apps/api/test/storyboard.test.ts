import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createFilmService } from '../src/modules/films/service'
import {
  createStoryboardService,
  parseStoryboard,
  StoryboardUnavailableError,
} from '../src/modules/films/storyboard'
import { user } from '../src/db/schema'

const USER = 'user-1'

function setup() {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user).values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now }).run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-sb-')))
  const films = createFilmService({ db, storage })
  return { films }
}

const GOOD_JSON = JSON.stringify({
  shots: [
    { title: 'Sunrise', prompt: 'a sun rising over mountains', cameraShot: 'wide', cameraMotion: 'crane', durationSeconds: 5 },
    { title: 'Face', prompt: 'a child looking up in wonder', cameraShot: 'close-up', durationSeconds: 3 },
  ],
})

describe('parseStoryboard', () => {
  it('parses valid JSON', () => {
    expect(parseStoryboard(GOOD_JSON).shots).toHaveLength(2)
  })
  it('strips an accidental ```json fence', () => {
    expect(parseStoryboard('```json\n' + GOOD_JSON + '\n```').shots).toHaveLength(2)
  })
  it('rejects unreadable output as a clean provider error', () => {
    expect(() => parseStoryboard('not json at all')).toThrow(StoryboardUnavailableError)
  })
  it('rejects a valid-JSON-but-wrong-shape response', () => {
    expect(() => parseStoryboard(JSON.stringify({ shots: [{ prompt: '' }] }))).toThrow(
      StoryboardUnavailableError,
    )
  })
})

describe('storyboard.generate', () => {
  it('turns the model response into DRAFT shots carrying the film style + camera preset', async () => {
    const { films } = setup()
    const film = await films.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    const svc = createStoryboardService({
      anthropicApiKey: 'test',
      films,
      complete: async () => GOOD_JSON,
    })

    const shots = await svc.generate(USER, film.id, { script: 'a hero wakes and journeys', styleId: 'disney' })
    expect(shots).toHaveLength(2)
    // Draft: no generation yet — nothing was generated or charged.
    expect(shots[0]!.generationId).toBeNull()
    // The film's style + the shot's camera intent are folded into the preset.
    expect(shots[0]!.promptPreset).toMatchObject({ styleId: 'disney', cameraShot: 'wide', cameraMotion: 'crane' })
    expect(shots[0]!.prompt).toBe('a sun rising over mountains')
    expect(shots[0]!.durationMs).toBe(5000)
    // The scene title is NOT set as a render overlay (a draft shot must render as
    // an empty slot, not a title card).
    expect(shots[0]!.title).toBeNull()

    // Persisted onto the film in order.
    const detail = films.getFilm(USER, film.id)
    expect(detail.shots).toHaveLength(2)
  })

  it('is unavailable without an API key', async () => {
    const { films } = setup()
    const film = await films.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    const svc = createStoryboardService({ anthropicApiKey: null, films })
    await expect(svc.generate(USER, film.id, { script: 'anything at all here' })).rejects.toBeInstanceOf(
      StoryboardUnavailableError,
    )
  })
})
