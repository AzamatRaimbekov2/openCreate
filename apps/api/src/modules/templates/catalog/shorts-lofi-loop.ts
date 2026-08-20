// apps/api/src/modules/templates/catalog/shorts-lofi-loop.ts
// «Лоу-фай петля» — the cosy ambient loop.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The lo-fi study loop is the oldest surviving format on the platform:
// an illustrated interior, one animated element, a music bed, and a stream that
// never ends. It began as a single looping GIF under a 24/7 radio and became its
// own genre when the format moved to Shorts and Reels — the loop shortened from
// infinite to twenty-odd seconds, and the replay is what the algorithm counts.
//
// DISCLOSURE TIER: none. It is drawn, not photographed — an illustrated interior
// is stylised on its face, no real person, place or event (ADR §12).
//
// LOOPABLE: yes, and this template is the shelf's purest case. Since 2025-03-31
// every replay counts as a view, so the loop is not a flourish here, it is the
// distribution mechanism (ADR §10).
//
// THE ONE THING EASY TO GET WRONG, and it is not a look, it is a physics
// question: ANY MOTION WITH A DIRECTION OF PROGRESS EXPOSES THE SEAM. A candle
// burning down, a glass filling, a shadow crossing a wall, a cat walking across
// the room — each of them is shorter at the end of the loop than at the start,
// and the human eye catches the jump-back instantly even when it cannot say why.
// Every motion this template ships is CYCLICAL (a tail flicking, a pendulum) or
// STOCHASTIC (rain, snow, steam, dust) — states with no memory, which look
// identical at second 0 and second 24. That is the entire design of the `motion`
// knob, and it is why "a candle" is not one of its options.
//
// THE SECOND THING: the three beats are ONE UNBROKEN SHOT, not three shots. The
// grid forces 8s clips (ADR §6), so a 24s loop is necessarily three generations —
// but every prompt repeats the identical framing, the identical light and the
// identical locked-off camera, so the joins read as no cut at all. A model given
// permission to reframe on beat 2 turns a static loop into a slideshow.
//
// THE THIRD: EXACTLY ONE thing moves. Not "mostly still" — one. Both knobs feed
// a single sentence that says so, because a scene with rain on the glass AND a
// swaying lamp AND a flickering screen is not cosy, it is busy, and busy does not
// loop.
//
// WHY 'anime' AND NOT 'cinematic': the format is illustrated, and the anime
// preset's negative prompt ("photorealistic, 3d render") actively pushes away the
// exact failure that would make this uncanny — a photoreal room with a photoreal
// cat in it, which is a different and much riskier product.
import type { Template } from '../types'

// Pasted into all three prompts. The framing half is ADR §11's safe box (the
// platform's UI eats the bottom ~26% and right ~17%); the text half exists
// because a drawn interior is exactly the kind of scene a model decorates with
// a poster, a calendar and a book spine, all of which come out as garbage
// lettering. The stillness half is this template's whole premise.
const FRAME =
  'FRAMING: vertical 9:16 format, the room composed so the subject and everything of interest sit in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD left empty — bare floor, bare desk surface or bare foreground — and nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no signage, no posters, no book titles, no calendars, no screens showing interface, no logos, no watermark. ' +
  'NO PERSON IN FRAME: nobody visible, nobody facing camera, no face. ' +
  'THE CAMERA NEVER MOVES: locked off on a tripod, no pan, no push, no drift, no zoom, identical framing for the entire shot.'

export const shortsLofiLoop: Template = {
  id: 'shorts-lofi-loop',
  category: 'shorts',
  name: 'Лоу-фай петля',
  tagline: 'Одна комната. Одно движение. Бесшовный круг на двадцать четыре секунды.',
  description:
    'Тихая рисованная комната, статичная камера и ровно одно движение в кадре — дождь по стеклу, ' +
    'хвост спящего кота, пар над кружкой. Ни склеек, ни лиц, ни единой надписи. ' +
    'Три бита по 8 секунд — это один непрерывный кадр: третий бит возвращает картинку ровно к первой, ' +
    'и ролик крутится по кругу без шва. Повтор на вертикальных платформах засчитывается как новый просмотр.',
  aspectRatio: '9:16',
  defaultStyleId: 'anime',
  titleTemplate: '{{scene}} · петля',

  // See the header: drawn rather than photographed, and the loop is the whole
  // point — beat 3's prompt states the frame match outright.
  loopable: true,
  disclosureTier: 'none',

  // THE TIER LADDER, AND WHY DRAFT IS seedance-1-5-pro RATHER THAN pixverse-v6
  // (changed 2026-08-20, and the reason is deployment reality rather than craft).
  //
  // All three of these serve 9:16 at 8s natively — the invariant
  // assertTemplatesValid() checks at boot (ADR §6) — and 8s is still the only
  // legal length here, because it is the intersection of the three duration
  // tables. What changed is that NONE of the original triple could actually
  // generate on production: pixverse-v6 and veo-3-1-fast both route to Runware,
  // whose production key is a placeholder, and wan-2-7 routes to Alibaba
  // DashScope, whose key is unset. The boot check verifies ratio and duration; it
  // does not verify that a provider is reachable, so the shelf passed every check
  // and then failed on the first real click.
  //
  // seedance-1-5-pro runs on kie.ai, which is verified working in production, and
  // it slots in with nothing else changing: 9:16 yes, 8s yes, and 56 credits at 8s
  // — the SAME price pixverse-v6 charged. So every shorts card still costs
  // 168 / 405 / 420, the shelf keeps its one-number property, and the ascending
  // ladder still holds (56 < 135 < 140).
  //
  // Standard and premium are deliberately LEFT ALONE. They light up the moment a
  // Runware or DashScope key exists, and pointing all three tiers at one working
  // model would make the tier picker a lie — three prices for identical output.
  // What we owe the user instead is the truth on the pill, which is what the
  // tierNotes below now carry.
  models: {
    draft: 'seedance-1-5-pro',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  // Provider availability leads every note, because on this deployment it is the
  // decision the user is actually making. The craft difference between the tiers
  // follows it, so the notes stay true once the keys land.
  tierNotes: {
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером. Негативный промпт стиля до него не доходит, так что «не фотореализм» держится только позитивной частью',
    standard: 'Сейчас не работает: нужен ключ провайдера. Он же ровнее держит один и тот же кадр все три бита — для петли это главное',
    premium: 'Сейчас не работает: нужен ключ провайдера',
  },

  musicPrompt:
    'lo-fi hip hop instrumental, dusty vinyl crackle, mellow rhodes piano chords, soft muted boom-bap drums, warm tape saturation, no vocals, calm and unhurried, seamlessly loopable',

  // TWO knobs, both on-screen (ADR §9): one changes the room, one changes the
  // single moving thing in it. Twelve combinations, and no two of them look
  // alike — which is exactly what keeps a batch of ten from being ten identical
  // clips. Nothing cosmetic is exposed: the light, the palette and the camera are
  // the format.
  variables: [
    {
      key: 'scene',
      kind: 'select',
      label: 'Какая комната',
      hint: 'Место и свет. Меняет весь кадр, а не только фон.',
      defaultValue: 'study',
      options: [
        {
          value: 'study',
          label: 'Кабинет под дождём',
          spoken: 'кабинет под дождём',
          prompt:
            'a small cosy study at night seen from inside, a large rain-streaked window filling the upper half of the frame, a desk lamp throwing a warm pool of amber light, stacks of closed books, a cold blue city glow beyond the glass, soft grain, muted teal and amber palette, hand-painted illustrated interior',
        },
        {
          value: 'cabin',
          label: 'Домик в снегу',
          spoken: 'домик в снегу',
          prompt:
            'a small wooden cabin interior at dusk seen from inside, a frosted window filling the upper half of the frame with heavy snowfall beyond it, a cast-iron stove throwing warm orange light across plank walls, a folded wool blanket over a chair, muted cream and rust palette, soft grain, hand-painted illustrated interior',
        },
        {
          value: 'train',
          label: 'Ночное купе',
          spoken: 'ночное купе',
          prompt:
            'a night train compartment seen from inside, a wide window filling the upper half of the frame with dark countryside and scattered distant lights sliding past, a single dim reading lamp above the berth, a folded coat on the seat, muted indigo and warm ochre palette, soft grain, hand-painted illustrated interior',
        },
        {
          value: 'balcony',
          label: 'Балкон в грозу',
          spoken: 'балкон в грозу',
          prompt:
            'a narrow apartment balcony at night seen from just inside the open door, potted plants along the rail in the upper half of the frame, wet tiles, a warm interior glow spilling out from behind the camera, a dense blue-black rainy city beyond, muted violet and amber palette, soft grain, hand-painted illustrated interior',
        },
      ],
    },
    {
      key: 'motion',
      kind: 'select',
      label: 'Что единственное движется',
      hint: 'Только цикличное или случайное. Всё, что «заканчивается», рвёт петлю.',
      defaultValue: 'rain',
      options: [
        {
          value: 'rain',
          label: 'Дождь по стеклу',
          spoken: 'дождь по стеклу',
          // Stochastic: droplets are constantly replaced, so the glass at 24s is
          // statistically identical to the glass at 0s. No memory, no seam.
          prompt:
            'rain running down the window glass — droplets forming, sliding, merging and being replaced continuously and endlessly, a steady random stream with no beginning and no end',
        },
        {
          value: 'tail',
          label: 'Хвост спящего кота',
          spoken: 'хвост спящего кота',
          // Cyclical: the flick returns the tail to where it started. The cat
          // itself must stay asleep — a cat that gets up is a cat with a plot.
          prompt:
            'the tail of a sleeping cat curled on the sill flicking slowly and rhythmically back and forth and returning each time to exactly where it started, the cat itself completely asleep and motionless, it never lifts its head, never opens its eyes, never gets up',
        },
        {
          value: 'steam',
          label: 'Пар над кружкой',
          spoken: 'пар над кружкой',
          // Stochastic. The cup is deliberately never described as emptying.
          prompt:
            'a thin ribbon of steam curling continuously upward from a full ceramic mug and dissipating, endlessly renewed, the mug itself never moving and never emptying',
        },
        {
          value: 'curtain',
          label: 'Штора на сквозняке',
          spoken: 'штора на сквозняке',
          // Cyclical: a draught breathes in and out and the fabric returns.
          prompt:
            'a light curtain breathing slowly in and out on a draught, billowing gently and settling back to exactly the same fall each time, an endless unhurried rhythm',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Комната',
      durationSeconds: 8,
      prompt:
        '{{scene}}. EXACTLY ONE THING MOVES IN THE ENTIRE FRAME: {{motion}}. Everything else in the room is perfectly, completely still — no swaying, no flickering, no drifting dust, no second moving element anywhere. ' +
        FRAME,
      preset: { styleId: 'anime', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Тишина',
      durationSeconds: 8,
      // Beat 2 says "identical" three times on purpose. This is the beat a model
      // will try to develop — reframe slightly, add a second motion, warm the
      // light — and any of those turns one shot into three.
      prompt:
        '{{scene}}. This is a direct continuation of the same unbroken shot: identical framing, identical composition, identical light, identical locked-off camera position, nothing in the room has changed or moved position. EXACTLY ONE THING MOVES IN THE ENTIRE FRAME: {{motion}}. Everything else is perfectly still — no new element enters, nothing is added, the light does not shift. ' +
        FRAME,
      preset: { styleId: 'anime', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Петля',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). With a locked-off camera and a memoryless
      // motion this is nearly free — which is precisely why the format was chosen
      // for the shelf. The instruction is still stated explicitly, because "the
      // last frame equals the first frame" is not something a model infers.
      prompt:
        '{{scene}}. This is a direct continuation of the same unbroken shot: identical framing, identical composition, identical light, identical locked-off camera position. EXACTLY ONE THING MOVES IN THE ENTIRE FRAME: {{motion}}. Everything else is perfectly still. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same room from the same angle in the same light with every object in the same place, so that the end cuts back to the beginning seamlessly and invisibly. ' +
        FRAME,
      preset: { styleId: 'anime', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
    },
  ],
}
