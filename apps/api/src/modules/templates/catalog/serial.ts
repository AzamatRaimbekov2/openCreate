// apps/api/src/modules/templates/catalog/serial.ts
// «Сериал» — one episode of a TV melodrama, the second FORMAT template
// (owner request 2026-07-18: «как фильм / как сериал / как аниме»).
//
// THE FORMAT: the episode grammar of a prime-time drama — recap card, calm
// before the storm, the discovery, the confrontation, the tears, the
// cliffhanger, «Продолжение следует…». Serialization is the engine: both free
// title cards exist to make one film read as EPISODE N of something bigger.
//
// THE LOOK: television photorealism, softer and warmer than the «Фильм»
// trailer — practical household light, handheld intimacy, faces over scale.
// Same 'cinematic' style preset; the prompts carry the TV grade.
//
// THE KNOBS re-aim the same episode: WHERE it happens (kitchen / office /
// hospital) and WHAT is found (letter / second phone / old photograph). The
// find substitutes into both prompts (English fragment) and one spoken line —
// where its `spoken` form is GENITIVE («из-за этого письма») so the Russian
// declines correctly for every option. Add options in genitive or you silently
// break that line.
import type { Template } from '../types'

export const serial: Template = {
  id: 'serial',
  category: 'format',
  name: 'Сериал',
  tagline: 'Серия прайм-тайм драмы: от «В предыдущих сериях» до клиффхэнгера.',
  description:
    'Готовая серия семейной драмы: рекап-карта, затишье, находка, ссора, слёзы и обрыв на самом интересном. ' +
    'Выбери, где всё происходит и что герой находит, — промпты, планы и реплики уже расставлены. ' +
    'Телевизионная картинка: тёплый свет, ручная камера, крупные планы.',
  aspectRatio: '16:9',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Сериал: {{find}}',

  // Same tier ladder as «Фильм»: every model holds 8s at 16:9 (enforced by
  // templates.test.ts); wan-2-7 standard so tagged characters persist between
  // episodes via references.
  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    standard: 'Держит персонажа по референсу — тегай героев из «Сущностей»',
    premium: 'Синхронный звук сцены — модель генерирует его вместе с видео',
  },

  musicPrompt:
    'television drama theme, melancholic strings, intimate piano motif, slow build, emotional and restrained, prime-time soap opera',

  variables: [
    {
      key: 'place',
      kind: 'select',
      label: 'Где происходит',
      defaultValue: 'kitchen',
      options: [
        {
          value: 'kitchen',
          label: 'Кухня',
          prompt:
            'a cramped warmly lit family kitchen in the evening, worn wooden table, a kettle steaming on the stove',
        },
        {
          value: 'office',
          label: 'Офис',
          prompt:
            'a late-night open-plan office, rows of dark monitors, one desk lamp burning, city lights outside the glass',
        },
        {
          value: 'hospital',
          label: 'Больница',
          prompt:
            'a quiet hospital corridor at night, pale green walls, flickering fluorescent light, an empty nurse station',
        },
      ],
    },
    {
      key: 'find',
      kind: 'select',
      label: 'Что находят',
      hint: 'Вокруг этого построена вся серия.',
      defaultValue: 'letter',
      options: [
        // `spoken` is GENITIVE on purpose — it is substituted into «…из-за
        // этого {{find}}» in the cliffhanger line. See the header note.
        {
          value: 'letter',
          label: 'Тайное письмо',
          prompt: 'a hidden handwritten letter in a worn envelope',
          spoken: 'письма',
        },
        {
          value: 'phone',
          label: 'Второй телефон',
          prompt: 'a cheap second mobile phone hidden under folded clothes',
          spoken: 'телефона',
        },
        {
          value: 'photo',
          label: 'Старая фотография',
          prompt: 'a creased old photograph with a torn-off corner',
          spoken: 'снимка',
        },
      ],
    },
  ],

  shots: [
    {
      // Free recap card FIRST — the single strongest "this is a series" signal,
      // and it costs nothing (no generation behind a title card).
      kind: 'title',
      beat: 'Рекап',
      durationSeconds: 2,
      title: { text: 'В предыдущих сериях…', position: 'center' },
    },
    {
      kind: 'clip',
      beat: 'Затишье',
      durationSeconds: 8,
      prompt:
        'a calm domestic evening in {{place}}, a middle-aged woman in a cardigan setting two cups on the table, soft warm practical light, quiet routine, television drama photorealism, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Я ведь правда поверила, что всё наладилось…', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Находка',
      durationSeconds: 8,
      prompt:
        'the woman freezes as she discovers {{find}} in {{place}}, her hand stops mid-air, close on her face as the realization lands, warm light going cold, television drama photorealism, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: 'Что это?..', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Конфронтация',
      durationSeconds: 8,
      prompt:
        'a tense argument between the woman and a middle-aged man in {{place}}, she holds up {{find}} between them, he raises his palms, cut-glass body language across the table, handheld intimacy, television drama photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      voiceover: { text: 'Это не то, что ты думаешь! Дай мне объяснить!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Слёзы',
      durationSeconds: 8,
      prompt:
        'extreme close-up of the woman fighting back tears, jaw set, eyes shining, the out-of-focus figure of the man behind her in {{place}}, one practical lamp, devastating quiet, television drama photorealism',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Я больше не могу тебе верить. Уходи.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Клиффхэнгер',
      durationSeconds: 8,
      prompt:
        'a doorway in {{place}}: an unexpected third figure stands silhouetted against the light, holding something unseen, the woman and the man turn to the door at the same instant, frozen beat, television drama photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'dolly-in', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      // The genitive `spoken` form lands here — «из-за этого письма/телефона/снимка».
      voiceover: { text: 'Нам нужно поговорить. Всё это — из-за этого {{find}}.', voice: 'Nikolai' },
    },
    {
      // The second free card — the serialization hook that makes ONE film read
      // as an episode and the next film a sequel.
      kind: 'title',
      beat: 'Финал серии',
      durationSeconds: 3,
      title: { text: 'Продолжение следует…', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
