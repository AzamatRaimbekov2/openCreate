// apps/api/src/modules/templates/catalog/shorts-timelapse-cycle.ts
// «Круг в одном кадре» — one locked-off frame, one complete cycle of time, back
// to the light it started on.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// WHY THIS IS THE TWELFTH CARD (the pick, and the argument for it). After wave 1
// and the three commissioned formats, the shelf covers a lot of subjects and
// exactly three relationships between the camera and time: the camera is still and
// nothing changes (lo-fi loop), the camera moves through a place (b-roll, POV), or
// something happens in front of it (everything else). Nothing on the shelf is
// about TIME ITSELF — and the timelapse is not only the most durable face-free
// format in short form, it is the one whose loop is structurally free, because a
// cycle is a thing that returns. Six of our loopable cards buy the loop with a
// carefully written frame match; this one gets it from the fact that a day ends
// where it began. That makes it the cheapest reliable loop on the shelf and the
// one most likely to survive a weak generation, which is worth a card by itself.
//
// AND IT IS THE EXACT COMPLEMENT OF THE LO-FI LOOP, which is the pleasing part.
// That card BANS any motion with a direction of progress, because a candle burning
// down is shorter at the end of the loop than at the start and the eye catches the
// jump. This card is built ENTIRELY out of progress — and closes anyway, because
// the progress it uses is circular. Read the two headers together; between them
// they state the whole rule about what may and may not loop.
//
// ORIGIN. Time-lapse is older than cinema's own conventions — the technique dates
// to the 1890s and became a genre with the nature-documentary and city-symphony
// traditions. Short form did not invent anything here; it just discovered that a
// vertical frame of a sky changing is a thing people will watch to the end and
// then watch again, and that it needs no face, no voice and no script.
//
// DISCLOSURE TIER: description. Photoreal footage sets the floor there, and NOT
// 'in-player' for the reason the b-roll card documents: no person appears, and
// every location is generic and unnamed. ANYONE ADDING A `place` OPTION: keep it
// anonymous — a named landmark moves this card up a tier (ADR §12).
//
// LOOPABLE: yes, by construction (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: THE MODEL MOVES THE CAMERA. A time-lapse is
// DEFINED by the camera not moving while everything else does — that is the entire
// grammar, and it is what makes a viewer read compressed time rather than a weird
// edit. But "a day passing over a valley" is a sweeping idea, and a model handed a
// sweeping idea drifts, pushes in, or reframes to make it feel cinematic. The
// instant the camera moves, the shot stops being a time-lapse and becomes an
// ordinary shot with an aggressive colour change in it. Every prompt therefore
// locks the camera off in the same words the lo-fi card uses, and repeats it.
//
// THE SECOND THING: IT RENDERS SLOW MOTION INSTEAD OF COMPRESSED TIME. Asked for
// "a day", a model will often produce eight real-time seconds under a warm grade.
// The language that actually produces a time-lapse is the language of what a
// time-lapse LOOKS like: clouds streaking into ribbons, shadows sweeping visibly
// across the ground, no individual person or vehicle legible as a person or
// vehicle — only smears of motion. That last clause is doing double duty, because
// it is also what keeps the disclosure tier down.
//
// THE THIRD: IT ENDS LATE. Told "a day passes", a model ends at night, because
// that is where a day ends. But a cycle only loops if it comes back to its START,
// so every `cycle` fragment names the return explicitly — "and back to exactly the
// same dawn" — and beat 3 says it again as a frame match.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11, plus the two clauses this
// format cannot do without: the locked camera and the "no legible person" rule
// that makes compressed time read as compressed time.
const FRAME =
  'FRAMING: vertical 9:16 format, the horizon and the sky held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD left as plain empty ground, water or road surface with nothing in it, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no signage, no road markings that read as letters, no logos, no watermark. ' +
  'NO LEGIBLE PERSON OR VEHICLE: any movement of people or traffic appears only as smeared blurred streaks of motion, never as an identifiable person, face or vehicle. ' +
  'THE CAMERA NEVER MOVES: locked off on a tripod, no pan, no tilt, no push, no drift, no zoom, identical framing for the entire shot — everything in the frame changes, the frame itself does not.'

export const shortsTimelapseCycle: Template = {
  id: 'shorts-timelapse-cycle',
  category: 'shorts',
  name: 'Круг в одном кадре',
  tagline: 'Камера не двигается ни секунды. Свет проходит полный круг и возвращается туда, откуда начал.',
  description:
    'Таймлапс в одном неподвижном кадре: облака вытягиваются в ленты, тени проходят по земле, ' +
    'свет меняется от рассвета до ночи — и возвращается ровно к тому рассвету, с которого начал. ' +
    'Петля здесь не приём, а свойство: сутки, гроза и год замыкаются сами. ' +
    'Ни людей, ни машин в узнаваемом виде, ни одной надписи. Три бита по 8 секунд.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{place}}: {{cycle}}',

  // Loopable by construction — a cycle returns; see the header on why that makes
  // this the most robust loop on the shelf. 'description' for the same reason the
  // b-roll card is: photoreal, but no person and no identifiable place.
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
    standard: 'Сейчас не работает: нужен ключ провайдера. Он же ровнее держит один и тот же кадр все три бита — для таймлапса это и есть всё',
    premium: 'Сейчас не работает: нужен ключ провайдера',
  },

  musicPrompt:
    'expansive ambient instrumental, slow evolving synth pads, distant piano notes, one long swell and release, patient and wide, no percussion, no vocals',

  // TWO knobs, both on-screen (ADR §9): the place and the cycle running through
  // it. Twelve combinations — and the second knob is unusually load-bearing here,
  // because on a card with no subject the passage of time IS the subject.
  variables: [
    {
      key: 'place',
      kind: 'select',
      label: 'Что в кадре',
      hint: 'Место без названия и без примет. Узнаваемый ориентир сюда не ставим.',
      defaultValue: 'lone-tree',
      options: [
        {
          value: 'lone-tree',
          label: 'Одинокое дерево в поле',
          spoken: 'одинокое дерево в поле',
          prompt:
            'a single broad old tree standing alone in the middle of an open field, low stone wall running away behind it, wide empty sky above filling most of the frame',
        },
        {
          value: 'crossroads',
          label: 'Городской перекрёсток',
          spoken: 'городской перекрёсток',
          prompt:
            'an ordinary city crossroads seen from a high window several floors up, four unremarkable building faces around it, tram wires strung overhead, wide sky above the rooftops',
        },
        {
          value: 'harbour',
          label: 'Рыбацкая гавань',
          spoken: 'рыбацкая гавань',
          prompt:
            'a small working fishing harbour, a dozen moored boats rising and falling on the swell, a stone breakwater running out to one side, open sky and sea filling the upper frame',
        },
        {
          value: 'mountain-lake',
          label: 'Горное озеро',
          spoken: 'горное озеро',
          prompt:
            'a still high-altitude lake with a bare rock ridge behind it, the water holding a mirror reflection of the ridge and the sky, a shingle shore in the near ground',
        },
      ],
    },
    {
      key: 'cycle',
      kind: 'select',
      label: 'Какой круг проходит',
      hint: 'Все три круга замыкаются сами — поэтому ролик и зацикливается.',
      defaultValue: 'day',
      options: [
        {
          value: 'day',
          label: 'Сутки',
          spoken: 'сутки',
          prompt:
            'A FULL TWENTY-FOUR HOUR CYCLE COMPRESSED INTO THE SHOT: cold blue dawn light, the sun rising and shadows sweeping visibly across the ground, harsh flat midday, long golden evening, deep blue night with lights coming on — AND BACK TO EXACTLY THE SAME COLD BLUE DAWN it started on. Clouds streak across the sky in continuous ribbons throughout',
        },
        {
          value: 'storm',
          label: 'Гроза проходит',
          spoken: 'гроза',
          prompt:
            'A FULL STORM FRONT PASSING THROUGH, COMPRESSED INTO THE SHOT: clear bright light, the sky darkening from one edge as the front rolls in, wind rising and everything bending, heavy rain sheeting across in visible sweeping curtains, then the front moving off and the sky clearing — AND BACK TO EXACTLY THE SAME CLEAR BRIGHT LIGHT it started on. Clouds boil and race across the sky throughout',
        },
        {
          value: 'seasons',
          label: 'Год',
          spoken: 'год',
          prompt:
            'A FULL YEAR COMPRESSED INTO THE SHOT: fresh spring green coming in, deep heavy summer growth, autumn colour turning and leaves stripping away, bare frozen winter under snow, the thaw — AND BACK TO EXACTLY THE SAME FRESH SPRING GREEN it started on. The sky races continuously overhead throughout and the light angle swings back and forth across the year',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Начало круга',
      durationSeconds: 8,
      prompt:
        'Time-lapse photography, photorealistic, locked-off tripod, natural light: {{place}}. {{cycle}} — this shot covers the first third of that cycle. Compressed time: clouds streaking into continuous ribbons, shadows sweeping visibly across the ground, everything in the frame moving fast while the frame itself is perfectly still. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Середина',
      durationSeconds: 8,
      // The middle of the cycle, and the beat where a model most wants to "improve"
      // the shot by moving in — hence the identical-framing language repeated in
      // the same words the lo-fi card uses.
      prompt:
        'Time-lapse photography, photorealistic, locked-off tripod, natural light: {{place}}. {{cycle}} — this shot covers the middle third of that cycle and is a direct continuation of the same unbroken time-lapse: identical framing, identical camera position, identical composition, nothing in the scene has been moved or re-staged. Compressed time throughout: streaking cloud, sweeping shadow, fast light. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Круг замкнулся',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). Free in principle, stated anyway: told "a day
      // passes" a model ends at night, because that is where a day ends. The cycle
      // only closes if the last frame is the FIRST light, not merely a later one.
      prompt:
        'Time-lapse photography, photorealistic, locked-off tripod, natural light: {{place}}. {{cycle}} — this shot covers the final third of that cycle and closes it, arriving back at the exact light the cycle began in. Identical framing, identical camera position, identical composition. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same place from the same angle in the same light at the same point of the cycle — so that the end cuts back to the beginning seamlessly and the cycle simply runs again. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
    },
  ],
}
