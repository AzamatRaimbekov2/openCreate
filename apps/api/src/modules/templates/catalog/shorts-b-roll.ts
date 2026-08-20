// apps/api/src/modules/templates/catalog/shorts-b-roll.ts
// «Кинематографичный B-roll» — one location, one camera move, no subject.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. Not a joke format and not a viral one: this is the stock-footage trade,
// which predates short form entirely and moved onto it intact. Establishing
// plates — a valley under fog, an empty road at golden hour — have always been
// bought rather than shot, and vertical feeds turned them into a genre of their
// own, watched for their own sake and used as the bed under everything else. It
// is the most useful card on this shelf and the least demonstrative: nobody
// screenshots it, everybody needs it.
//
// DISCLOSURE TIER: description. The footage is photoreal, which sets the floor at
// 'description' — but deliberately NOT 'in-player'. The in-player tier is for
// photoreal PEOPLE, IDENTIFIABLE PLACES and EVENTS (ADR §12), and there is none
// of that here: no person appears, and every location is generic and unnamed —
// "a pine valley", not a named one. ANYONE ADDING AN OPTION: naming a real
// landmark moves this template into in-player, which this shelf does not carry.
// Keep the locations anonymous.
//
// LOOPABLE: yes. Two beats push in, the third pulls back out onto the frame the
// first opened on (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: ASKING FOR A COMPOUND CAMERA MOVE. "A slow
// push in while craning up and panning right" is a sentence a director can say
// and a model cannot execute. What comes back is not the move — it is a drifting
// approximation that changes direction halfway, and on a template whose entire
// content IS the camera move, that is the whole clip wasted. So each beat asks
// for exactly ONE simple move and then actively forbids the rest by name: no pan,
// no tilt, no zoom, no crane, no orbit, no handheld, no combination. One verb per
// clip is the whole discipline of this template.
//
// THE SECOND THING, which is why there is no `move` knob: the three beats are one
// continuous camera move split across the 8-second grid, so the move cannot vary
// per row of a batch without breaking the loop. Direction is authored; the
// location and the hour are what the user turns.
//
// AND THE THIRD, quieter one: NO SUBJECT. A model handed an empty landscape will
// put a lone figure in it, or a car on the road, or a bird — it has learned that
// a shot needs a subject. An empty plate is the product here; a walker on the
// ridge makes it someone else's shot and, on a photoreal plate, drags the
// disclosure tier upward. Hence "no person, no vehicle, no animal, no movement
// but the air" in every prompt.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11 — and it matters more on
// b-roll than anywhere else on the shelf, because this is the template whose
// output actually gets composited under other people's captions, so the empty
// lower third is not a courtesy to the platform's UI, it is the working space.
const FRAME =
  'FRAMING: vertical 9:16 format, the horizon and everything of interest held in the UPPER TWO THIRDS of the frame with clear sky or headroom above, the LOWER THIRD of the frame left deliberately empty and uncluttered — plain ground, plain water or plain road surface with nothing in it — and nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no road signs, no route markings, no signage, no logos, no watermark. ' +
  'NO SUBJECT: no person, no figure in the distance, no vehicle, no animal, no bird. Nothing moves in the frame except the air, the water and the light.'

export const shortsBRoll: Template = {
  id: 'shorts-b-roll',
  category: 'shorts',
  name: 'Кинематографичный B-roll',
  tagline: 'Одна локация, одно движение камеры, золотой час. И ни одного человека.',
  description:
    'Чистая перебивка: одна локация, один медленный проход камеры, свет золотого или синего часа. ' +
    'Ни людей, ни машин, ни животных — только воздух и свет. Нижняя треть кадра оставлена пустой намеренно: ' +
    'именно туда потом ложится подпись. Три бита по 8 секунд — это одно непрерывное движение: ' +
    'наезд, наезд, отъезд ровно в исходный кадр. Ролик замыкается в петлю.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{location}}, {{hour}}',

  // See the header: photoreal, so 'description' is the floor — but deliberately
  // NOT 'in-player', because no person appears and every location is generic and
  // unnamed. Adding a named landmark would move this card up a tier.
  loopable: true,
  disclosureTier: 'description',

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
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером',
    standard: 'Сейчас не работает: нужен ключ провайдера. Он же ровнее держит один и тот же пейзаж все три бита',
    premium: 'Сейчас не работает: нужен ключ провайдера',
  },

  musicPrompt:
    'ambient cinematic underscore, slow sustained synth pads, distant reverbed piano notes, low sub drone, patient and wide, no percussion, no vocals',

  // TWO knobs, both on-screen (ADR §9): the place and the light. Twelve
  // combinations, and the light is not cosmetic here the way it is on the
  // documentary card — on a shot with no subject, the light IS the subject.
  // There is deliberately no `move` knob; see the header.
  variables: [
    {
      key: 'location',
      kind: 'select',
      label: 'Где снято',
      hint: 'Место без названия и без примет. Узнаваемый ориентир сюда не ставим.',
      defaultValue: 'pine-valley',
      options: [
        {
          value: 'pine-valley',
          label: 'Хвойная долина',
          spoken: 'хвойная долина',
          prompt:
            'a wide unnamed valley of dense dark pine forest, low mist lying in the folds between the ridges, a single narrow unpaved track winding away through the trees, distant ranges layered into the haze',
        },
        {
          value: 'rooftop',
          label: 'Крыша над городом',
          spoken: 'крыша над городом',
          prompt:
            'the empty gravel rooftop of a tall building high above a dense anonymous city, ventilation ducts and a low concrete parapet in the near ground, an unremarkable skyline of towers stretching away to the horizon',
        },
        {
          value: 'coast-road',
          label: 'Дорога вдоль дюн',
          spoken: 'дорога вдоль дюн',
          prompt:
            'an empty two-lane road running dead straight along a coastline between low sand dunes and marram grass bending in the wind, the open sea flat and wide beyond them',
        },
        {
          value: 'underpass',
          label: 'Бетонная развязка',
          spoken: 'бетонная развязка',
          prompt:
            'the vast empty underside of a concrete motorway interchange, receding rows of massive square pillars, cracked tarmac, sheets of standing water holding the reflection of the sky',
        },
      ],
    },
    {
      key: 'hour',
      kind: 'select',
      label: 'Какой свет',
      hint: 'На кадре без героя свет и есть герой.',
      defaultValue: 'golden',
      options: [
        {
          value: 'golden',
          label: 'Золотой час',
          spoken: 'золотой час',
          prompt:
            'golden hour, the low sun raking in almost horizontally, long shadows stretched right across the frame, warm dust haze hanging in the air, deep amber highlights',
        },
        {
          value: 'blue',
          label: 'Синий час',
          spoken: 'синий час',
          prompt:
            'blue hour just after sunset, no sun in the sky, cool even ambient light with no hard shadows anywhere, deep blue shadow tones and a pale band of afterglow along the horizon',
        },
        {
          value: 'dawn-fog',
          label: 'Туманный рассвет',
          spoken: 'туманный рассвет',
          prompt:
            'first light at dawn, thick cold fog softening everything past the middle distance into flat pale grey, no visible sun, moisture suspended in the air catching what light there is',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Заход',
      durationSeconds: 8,
      prompt:
        'Cinematic establishing plate, shot on a full-frame camera with an anamorphic lens, shallow depth of field, natural colour grading: {{location}}, {{hour}}. ' +
        'ONE CAMERA MOVE ONLY: a slow, smooth, perfectly steady dolly forward into the scene at a constant speed. No pan, no tilt, no roll, no zoom, no crane, no orbit, no handheld shake, no change of direction — one single forward move and nothing else. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Проход',
      durationSeconds: 8,
      prompt:
        'Cinematic establishing plate, same camera, same lens, same colour grading: {{location}}, {{hour}}. This is a direct continuation of the same unbroken move, deeper into the identical location under the identical light. ' +
        'ONE CAMERA MOVE ONLY: the same slow, smooth, perfectly steady dolly forward at the same constant speed. No pan, no tilt, no roll, no zoom, no crane, no orbit, no handheld shake, no change of direction. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Отъезд в петлю',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). Reversing the move is still ONE move, which is
      // the only reason this template can loop at all: a pan or a crane back to
      // the start would be the compound move the header forbids.
      prompt:
        'Cinematic establishing plate, same camera, same lens, same colour grading: {{location}}, {{hour}}. ' +
        'ONE CAMERA MOVE ONLY: a slow, smooth, perfectly steady dolly backward, retreating along the exact path it came in on at a constant speed. No pan, no tilt, no roll, no zoom, no crane, no orbit, no handheld shake. ' +
        'THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same view of the same place from the same distance in the same light — so that the end cuts back to the beginning seamlessly. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
    },
  ],
}
