// apps/api/src/modules/templates/catalog/shorts-stylised-everyday.ts
// «Будни в другой технике» — the stylised everyday transform.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The format is a direct descendant of the "what if X were animated by Y"
// edits that circulated as fan art long before video models existed, and it became
// a short-form staple the moment a model could hold one animation idiom across
// eight seconds. The premise is always the same and it is the least clever premise
// on this shelf, which is why it works: take the most ordinary thing in the world
// — a rush-hour carriage, a laundromat at two in the morning — and render it
// entirely in a medium nobody would ever spend that medium on.
//
// DISCLOSURE TIER: none. The whole point is that nothing in frame is photographic
// (ADR §12).
//
// LOOPABLE: yes. A–B–A: a wide, a detail inside the same place, then back to the
// wide. Three beats, 24s (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: MIXING ONE PHOTOREAL ELEMENT INTO A STYLISED
// PLATE. It happens on its own — the model paints the carriage beautifully and
// then renders one commuter's face photographically, or drops a real reflection
// into a painted window. That single element reintroduces the exact uncanny read
// this format was chosen to avoid, and it is worse than a fully photoreal shot,
// because a fully photoreal shot at least reads as one thing. So every idiom
// fragment below ends with "absolutely no photographic or 3D-rendered element
// anywhere in frame", and it is not padding. Commit one hundred per cent.
//
// THE SECOND THING, specific to the physical idioms: CLAYMATION ONLY READS AS
// CLAYMATION WITH FRAME STUTTER. A video model trained on live action interpolates
// smoothly, and smooth plasticine looks like a 3D render of plasticine — which is
// the uncanniest possible outcome, since it is stylised AND wrong. The stepped
// 12-fps cadence with no motion blur has to be demanded, every time, in the
// fragment itself. This is the same fight the 'hand-drawn' style documents in
// presets.ts and the brick shelf documents in brick-heist.ts.
//
// WHY defaultStyleId IS null AND NOT A BUILTIN: the `idiom` knob IS the style,
// and it changes per row of a batch. Stamping a builtin preset on top would paste
// a second, competing look description into every prompt — and if that builtin
// were 'cinematic', its fragment ("photorealistic, film grain") would demand
// precisely the failure the paragraph above exists to prevent. One look per plate.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11; the text clause matters
// more here than anywhere else on the shelf, because every one of these scenes
// is a place covered in signage in real life — a metro carriage, a laundromat, a
// bus stop — and a model reproducing that signage produces garbage lettering
// across the whole frame.
const FRAME =
  'FRAMING: vertical 9:16 format, the subject and everything of interest held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD left as empty uncluttered floor or foreground, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no station names, no route boards, no signage, no notices, no posters, no product labels, no logos, no watermark, no screens showing interface. ' +
  'Nobody looks at the camera and nobody addresses the camera.'

export const shortsStylisedEveryday: Template = {
  id: 'shorts-stylised-everyday',
  category: 'shorts',
  name: 'Будни в другой технике',
  tagline: 'Метро в час пик, целиком слепленное из пластилина. И больше ничего.',
  description:
    'Самая обычная сцена — вагон в час пик, ночная прачечная, остановка под дождём — но целиком, ' +
    'до последнего предмета, сделанная в одной анимационной технике: акварель, пластилин, валяная шерсть, ' +
    'бумажная вырезка. Ни одного фотографического элемента в кадре, ни одной надписи. ' +
    'Три бита по 8 секунд: общий план, деталь, возврат к общему — ролик замыкается в петлю.',
  aspectRatio: '9:16',
  // Deliberately null — see the header. The `idiom` knob is this template's style
  // axis, and a builtin preset would paste a second look description on top of it.
  defaultStyleId: null,
  titleTemplate: '{{scene}}: {{idiom}}',

  // See the header: nothing in frame is photographic, by construction. A–B–A, so
  // beat 3 is an explicit match back to the opening wide.
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
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером',
    standard: 'Сейчас не работает: нужен ключ провайдера. Он же ровнее держит одну технику все три бита',
    premium: 'Сейчас не работает: нужен ключ провайдера',
  },

  musicPrompt:
    'gentle whimsical instrumental, plucked ukulele and celesta, soft brushed percussion, warm woodwinds, unhurried and slightly nostalgic, no vocals',

  // TWO knobs, and both change what is literally on screen (ADR §9): one is the
  // place, the other is the entire visual language it is made of. Sixteen
  // combinations, none of which resembles another — this is the template on the
  // shelf with the widest spread per batch.
  variables: [
    {
      key: 'scene',
      kind: 'select',
      label: 'Какая сцена',
      hint: 'Чем скучнее место, тем сильнее работает приём.',
      defaultValue: 'metro',
      options: [
        {
          value: 'metro',
          label: 'Метро в час пик',
          spoken: 'метро в час пик',
          prompt:
            'a packed underground metro carriage at rush hour: commuters standing shoulder to shoulder gripping overhead rails, coats and bags pressed together, tunnel darkness rushing past the windows, harsh even ceiling light',
        },
        {
          value: 'laundromat',
          label: 'Ночная прачечная',
          spoken: 'ночная прачечная',
          prompt:
            'a twenty-four-hour laundromat at two in the morning: two long rows of front-loading machines with drums turning, one lone person waiting on a plastic chair against the far wall, flat green fluorescent light, wet reflections on the tiled floor',
        },
        {
          value: 'busstop',
          label: 'Остановка под дождём',
          spoken: 'остановка под дождём',
          prompt:
            'a suburban bus stop shelter in steady rain at dusk: four strangers standing apart under the shelter roof, umbrellas closed and dripping, headlights smearing across the wet road behind them, low grey light',
        },
        {
          value: 'stairwell',
          label: 'Подъезд вечером',
          spoken: 'подъезд вечером',
          prompt:
            'the landing of an old apartment block stairwell in the evening: chipped painted walls, a bank of small metal mailboxes, a bicycle chained to the banister, one bare bulb throwing hard shadows up the steps, a neighbour climbing out of frame',
        },
      ],
    },
    {
      key: 'idiom',
      kind: 'select',
      label: 'В какой технике',
      hint: 'Техника применяется ко ВСЕМУ кадру без исключений — в этом весь приём.',
      defaultValue: 'claymation',
      options: [
        {
          value: 'claymation',
          label: 'Пластилин',
          spoken: 'пластилин',
          // The stutter clause is the load-bearing one — see the header.
          prompt:
            'RENDERED ENTIRELY AS STOP-MOTION CLAY ANIMATION: every surface, every figure and every object modelled by hand in plasticine with visible thumbprints, tool marks and fingerprint texture, slightly lumpy hand-made geometry, matte clay sheen, a real tabletop set built from clay and card; STEPPED JITTERY STOP-MOTION AT TWELVE FRAMES PER SECOND, no motion blur, no smooth interpolation, a tiny involuntary wobble in every held object between frames; absolutely no photographic and no 3D-rendered element anywhere in frame',
        },
        {
          value: 'watercolour',
          label: 'Акварель',
          spoken: 'акварель',
          prompt:
            'RENDERED ENTIRELY AS HAND-PAINTED WATERCOLOUR ANIMATION: soft washed pigment with visible paper tooth and dried brush edges, hand-inked character outlines, painted background layers, colour bleeding gently past the lines, gentle traditional 2D animation, muted natural palette; absolutely no photographic and no 3D-rendered element anywhere in frame',
        },
        {
          value: 'felt',
          label: 'Валяная шерсть',
          spoken: 'валяная шерсть',
          prompt:
            'RENDERED ENTIRELY AS NEEDLE-FELTED WOOL STOP-MOTION: every surface, figure and object made of soft felted wool with visible fibres, fuzzy silhouettes, hand-stitched seams and slightly uneven handmade proportions, a real tabletop set built from wool and felt; STEPPED JITTERY STOP-MOTION AT TWELVE FRAMES PER SECOND, no motion blur, no smooth interpolation; absolutely no photographic and no 3D-rendered element anywhere in frame',
        },
        {
          value: 'papercraft',
          label: 'Бумажная вырезка',
          spoken: 'бумажная вырезка',
          prompt:
            'RENDERED ENTIRELY AS A LAYERED CUT-PAPER DIORAMA: every element a flat shape scissor-cut from coloured card, arranged in visibly separated depth layers casting small hard shadows onto the layer behind, torn and cut paper edges, matte paper texture; STEPPED JITTERY STOP-MOTION AT TWELVE FRAMES PER SECOND, no motion blur, no smooth interpolation; absolutely no photographic and no 3D-rendered element anywhere in frame',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Общий план',
      durationSeconds: 8,
      prompt:
        '{{scene}}. {{idiom}}. The camera is locked off in a wide establishing view of the whole space; the ordinary business of the place continues quietly, nobody performs, nothing dramatic happens. ' +
        FRAME,
      preset: { cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Деталь',
      durationSeconds: 8,
      // The B of A–B–A. It is a closer view of the SAME place, not a new place —
      // and it is where the idiom actually sells itself, because thumbprints and
      // paper edges only exist at this distance.
      prompt:
        '{{scene}}. {{idiom}}. A closer view of one small corner of the very same space, same lighting, same materials: the handmade texture of the medium is clearly visible at this distance — the thumbprints, the fibres, the brush edges, the cut paper. One small ordinary gesture plays out and finishes. ' +
        FRAME,
      preset: { cameraShot: 'close-up', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Возврат',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). The A of A–B–A, stated as an explicit frame
      // match rather than left to "wide shot again", which a model will happily
      // satisfy from a different corner of the room.
      prompt:
        '{{scene}}. {{idiom}}. The same wide establishing view of the whole space this video opened on: identical camera position, identical angle, identical lighting, everything back where it was. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY, so that the end cuts back to the beginning seamlessly. ' +
        FRAME,
      preset: { cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
    },
  ],
}
