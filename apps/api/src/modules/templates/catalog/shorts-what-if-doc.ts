// apps/api/src/modules/templates/catalog/shorts-what-if-doc.ts
// «Псевдодокументалка» — the surreal what-if, shot as if it were ordinary.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The deadpan mockumentary is older than the platform by decades — the
// tradition runs from the BBC's spaghetti-harvest broadcast through Spinal Tap
// and the observational-comedy sitcoms that made the vocabulary universal. Short
// form inherited it whole: the fixed observational camera, the flat institutional
// narration, the total refusal to acknowledge the premise. AI video did nothing
// to the genre except make its one impossible ingredient cheap — you can now put
// the dolphins at the desks.
//
// DISCLOSURE TIER: description. The look is photoreal and documentary, which is
// exactly the register the disclosure rule cares about, even though the subject
// is impossible. Non-photoreal in premise, photoreal in execution → the label
// goes in the expanded description (ADR §12).
//
// LOOPABLE: NO, and this is the one format on the shelf that is honestly not
// loopable. The narration is a three-line escalation — shift, quota, retention —
// and a loop would restate the setup over the payoff. Forcing a frame match onto
// beat 3 would buy a replay and spend the joke to do it. Three beats, 24s, ends.
//
// THE ONE THING EASY TO GET WRONG, and it is the only thing: ASKING FOR "FUNNY".
// The deadpan IS the joke. A prompt containing "funny", "comical", "cartoonish",
// "whimsical" or "absurd" gets a model that performs the absurdity — a dolphin
// mugging at the lens, a bear doing a take, exaggerated proportions, a bouncy
// palette — and the moment anything in frame knows it is a joke, there is no
// joke. So the prompts below read like a dull corporate B-roll brief: available
// light, locked-off camera, ordinary business continuing, nobody reacting to
// anything. The premise is the only unusual thing in frame and it is never
// pointed at. The same rule governs the Russian narration: it is written as
// boring trade journalism about shift patterns and staff turnover, and it never
// once mentions that the workers are animals.
//
// A CONSEQUENCE WORTH STATING: musicPrompt explicitly asks for "no comedy cues".
// A slide-whistle under this footage does the same damage a "funny" prompt does,
// one layer later.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11. The text clause carries
// extra weight here because every one of these premises is set in a workplace,
// and workplaces are the most sign-covered environments there are — a model
// reproducing a badge, a safety notice and a departures board fills the frame
// with garbled lettering.
const FRAME =
  'FRAMING: vertical 9:16 format, the subjects held in the UPPER TWO THIRDS of the frame with clear headroom above them, the LOWER THIRD left as empty uncluttered floor or desk surface, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no lower thirds, no name badges, no safety notices, no signage, no screens showing interface or documents, no logos, no watermark. ' +
  'REGISTER: shot as a plain observational documentary — natural available light, unremarkable composition, no colour grading, no lens flare, no slow motion. Nobody in frame looks at the camera, nobody reacts to the camera, and nobody in frame treats anything happening as unusual. Not funny, not comical, not cartoonish, not exaggerated: completely straight and matter-of-fact.'

export const shortsWhatIfDoc: Template = {
  id: 'shorts-what-if-doc',
  category: 'shorts',
  name: 'Псевдодокументалка',
  tagline: 'Дельфины в опенспейсе. Снято так, будто это обычный репортаж о работе.',
  description:
    'Абсурдная посылка, снятая как самый скучный производственный репортаж: доступный свет, статичная камера, ' +
    'закадровый голос про графики смен и текучесть кадров. Никто в кадре не замечает, что происходит что-то странное — ' +
    'именно в этом вся шутка. Три бита по 8 секунд: общий план цеха, деталь рабочего процесса, конец смены. ' +
    'Ни одной надписи в кадре, реплики — по-русски, ровным дикторским тоном.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{premise}}',

  // See the header: photoreal documentary execution over an impossible premise —
  // the register is what the disclosure rule cares about — and no real person or
  // place appears. NOT loopable, honestly: the narration is a three-line escalation
  // and a loop would restate the setup over the payoff.
  loopable: false,
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
    standard: 'Сейчас не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же сам читает закадровый текст',
  },

  musicPrompt:
    'restrained observational documentary underscore, sparse muted piano notes, low sustained strings, neutral and unhurried, no melodic hook, no comedy cues, no slide whistle, no vocals',

  // TWO knobs. `premise` is the on-screen one ADR §9 requires — it replaces every
  // subject in the frame. `hour` is openly cosmetic (it moves the light and the
  // shadows) and it earns its place only because it multiplies twelve rows out of
  // four premises without repeating a shot.
  variables: [
    {
      key: 'premise',
      kind: 'select',
      label: 'Что происходит',
      hint: 'Единственное невозможное в кадре. Всё остальное — обычная работа.',
      defaultValue: 'dolphins-office',
      options: [
        {
          value: 'dolphins-office',
          label: 'Дельфины в опенспейсе',
          spoken: 'дельфины в опенспейсе',
          prompt:
            'bottlenose dolphins seated upright at ordinary office desks on a corporate open-plan floor, lanyards over their heads, flippers resting on keyboards, ergonomic mesh chairs, a water cooler and a printer against the far wall; everything else about the office is completely normal and unremarkable',
        },
        {
          value: 'bears-laundromat',
          label: 'Медведи в прачечной',
          spoken: 'медведи в прачечной',
          prompt:
            'full-grown brown bears working a night shift in a municipal industrial laundry, folding pressed sheets on a long stainless steel table with their claws, one bear pushing a wheeled linen cart down the aisle, rows of industrial washing drums turning behind them; everything else about the laundry is completely normal and unremarkable',
        },
        {
          value: 'pigeons-tower',
          label: 'Голуби в диспетчерской',
          spoken: 'голуби в диспетчерской',
          prompt:
            'city pigeons standing along the consoles of an airport air traffic control tower, one perched on a discarded headset, another walking slowly across a radar display, wide angled windows looking out onto a distant runway; everything else about the control tower is completely normal and unremarkable',
        },
        {
          value: 'cows-busstop',
          label: 'Коровы на остановке',
          spoken: 'коровы на остановке',
          prompt:
            'dairy cows queueing patiently in single file at a suburban bus shelter, canvas shoulder bags hooked over their necks, standing the correct distance apart, ordinary parked cars and low apartment blocks behind them; everything else about the street is completely normal and unremarkable',
        },
      ],
    },
    {
      key: 'hour',
      kind: 'select',
      label: 'Время смены',
      hint: 'Меняет свет и тени. Сюжет не трогает.',
      defaultValue: 'midday',
      options: [
        {
          value: 'morning',
          label: 'Начало смены',
          spoken: 'начало смены',
          prompt: 'early morning, flat grey overcast daylight, the first hour of the working day, the room still filling up',
        },
        {
          value: 'midday',
          label: 'Середина дня',
          spoken: 'середина дня',
          prompt: 'flat even midday light, overhead fluorescent tubes doing most of the work, the dead middle of the working day',
        },
        {
          value: 'evening',
          label: 'Конец смены',
          spoken: 'конец смены',
          prompt: 'the end of the working day, low amber light raking in at a shallow angle, long shadows, half the room already switched off',
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
        'Observational documentary footage, {{hour}}: {{premise}}. Wide establishing shot from a locked-off tripod at standing height, the ordinary business of the place continuing quietly, no one performing for the camera. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'cinematic' },
      // Boring trade journalism, on purpose. It never mentions the animals.
      voiceover: { text: 'Смена начинается в семь двадцать. За четыре года график здесь не менялся.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Процесс',
      durationSeconds: 8,
      // The detail beat. It is where a model most wants to add a reaction shot —
      // hence "does not look up, does not react, does not acknowledge the camera"
      // spelled out rather than left to the register clause in FRAME.
      prompt:
        'Observational documentary footage, {{hour}}: {{premise}}. Medium shot of one of them working steadily through a routine task, hands or flippers or claws busy, a colleague passing behind. The subject does not look up, does not react and does not acknowledge the camera at any point. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'cinematic' },
      voiceover: { text: 'Норма выработки — сто двадцать единиц в час. Её закрывают примерно семь сотрудников из десяти.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Конец смены',
      durationSeconds: 8,
      // The payoff line is the flattest of the three, which is why it is last: the
      // funniest possible thing a documentary can say about a room full of cows at
      // a bus stop is that staff turnover there is below the industry average.
      prompt:
        'Observational documentary footage, {{hour}}: {{premise}}. A slow handheld shot drifting through the space as the work winds down, one of them stationary in the middle distance while the others move past, the light going. Nobody looks at the camera. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'cinematic' },
      voiceover: { text: 'Текучесть здесь ниже средней по отрасли. Большинство остаётся дольше пяти лет.', voice: 'Nikolai' },
    },
  ],
}
