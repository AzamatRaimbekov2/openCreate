// apps/api/src/modules/templates/catalog/shorts-pov-immersion.ts
// «От первого лица» — POV immersion. The camera is the character, and the
// premise is carried entirely by the place.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. Three lineages converge here. Found footage taught audiences to read a
// shaking handheld frame as a person's eyes (The Blair Witch Project, 1999;
// Cloverfield, 2008). Action cameras made the first-person plate an everyday
// object rather than a stylistic choice. And short form supplied the grammar that
// ties them together — the "POV: …" caption, which states a premise in six words
// and then lets the footage do the rest. AI video suits the format better than it
// suits almost anything else, for one structural reason: THE FORMAT NEEDS NO
// ACTOR. There is no performance to get uncanny, no face to hold across a cut,
// no lip-sync. The camera is the character, and an empty place is the easiest
// thing a video model renders well.
//
// DISCLOSURE TIER: description. Photoreal footage sets the floor there — but not
// 'in-player', for the same reason the b-roll card is not: no person appears, and
// every location is generic and unnamed. ANYONE ADDING A `premise` OPTION: keep it
// anonymous. A named street or building moves this card up a tier (ADR §12).
//
// LOOPABLE: yes, and the loop is also the best ending the format has. You walk,
// you turn, and you are back where you started — which in an empty place reads as
// meaning rather than as a technical trick. Beat 3 states the frame match (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: HANDS. A first-person frame invites them, and
// hands are still the single most visible thing 2026 models fail at — a static
// open palm held up in frame is the canonical artefact, because a still hand gives
// the model unlimited time to render fingers it cannot count. The mitigation
// everybody reaches for is "keep the hand moving and partly out of focus", and it
// does help: motion blur and shallow depth of field hide the error. But the
// STRONGEST version of this format has no hands at all, and that is what this
// card ships. Every prompt says so outright, and the fallback exists only in this
// comment so nobody has to rediscover it.
//
// THE SECOND THING, which is the same failure wearing a coat: REFLECTIONS. Three
// of the four premises below are full of reflective surfaces — still water, wet
// tiles, glasshouse panes, ferry windows at night — and a model asked for an empty
// place will happily put a figure in the glass. So the no-person clause is
// explicit about reflections, not just about bodies.
//
// WHY cameraShot IS 'none' AND NOT A SIZE: a first-person frame has no shot size.
// It is not a medium shot of anything; it is where the eyes are. Declaring
// 'medium' would paste "medium shot" into the prompt and pull the model toward
// filming a subject, which is exactly what this format does not do.
import type { Template } from '../types'

// Pasted into all three prompts. The framing half is ADR §11's safe box, which a
// POV plate satisfies naturally — the floor ahead of you IS the empty lower third.
// The text half matters because every one of these places is signed in real life:
// a metro platform, a city street, a ferry deck.
const FRAME =
  'FRAMING: vertical 9:16 format, shot from human eye height, the space ahead held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD showing only the empty ground immediately ahead, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no station names, no street signs, no shop signage, no notices, no logos, no watermark, no screens showing interface. ' +
  'NO PERSON ANYWHERE: no hands, no arms, no fingers, no feet, no legs, no body, no other figure, and NO REFLECTION OF A PERSON in any glass, water, metal or mirrored surface. The place is completely empty of people.'

export const shortsPovImmersion: Template = {
  id: 'shorts-pov-immersion',
  category: 'shorts',
  name: 'От первого лица',
  tagline: 'POV: ты последний человек в городе. Камера — это твои глаза.',
  description:
    'Съёмка от первого лица: камера идёт через пустое место, и вся посылка держится на самом месте — ' +
    'ни актёра, ни лица, ни реплик. Ни рук в кадре, ни отражений: именно там модели ломаются заметнее всего. ' +
    'Второй регулятор добавляет одну деталь, из-за которой становится ясно, что ты здесь не один. ' +
    'Три бита по 8 секунд: ты идёшь, ты замечаешь, ты возвращаешься туда, откуда начал — ролик замыкается.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'POV: {{premise}}',

  // See the header: this card is 'description' rather than 'in-player' only
  // because no person appears and no location is identifiable. Loopable, and the
  // return is the ending rather than a trick bolted onto one.
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
    standard: 'Сейчас не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же генерирует звук — шаги и дыхание здесь половина эффекта',
  },

  musicPrompt:
    'sparse unsettling ambient, low sub drone, distant reverberant room tone, one sustained high string harmonic, no percussion, no melody, no vocals',

  // TWO knobs, both on-screen (ADR §9). `premise` replaces the entire location —
  // and in this format the location IS the premise, since there is no narration to
  // state one. `presence` adds the single detail that turns an empty place into an
  // occupied one; it is small on the page and it is the whole hook on screen.
  variables: [
    {
      key: 'premise',
      kind: 'select',
      label: 'Где ты',
      hint: 'Место без названия и без примет — здесь оно и есть вся посылка.',
      defaultValue: 'empty-city',
      options: [
        {
          value: 'empty-city',
          label: 'Пустой город',
          spoken: 'ты последний человек в городе',
          prompt:
            'a wide city shopping street at first light, completely empty of people and traffic, shutters down over every frontage, litter drifting along the kerb, a traffic light still cycling green to red for nobody, low flat dawn haze',
        },
        {
          value: 'flooded-metro',
          label: 'Затопленное метро',
          spoken: 'метро под водой',
          prompt:
            'an underground metro platform half flooded with still black water up to knee height, emergency lighting only, a dead train standing at the platform with its doors open, ripples spreading slowly outward across the water',
        },
        {
          value: 'greenhouse',
          label: 'Заброшенная оранжерея',
          spoken: 'оранжерея, в которую никто не заходил',
          prompt:
            'the inside of a huge abandoned Victorian glasshouse overgrown from within, broken panes in the iron frame, vines through the structure, a gravel path disappearing under leaves, low sun throwing moving leaf shadows across everything',
        },
        {
          value: 'night-ferry',
          label: 'Ночной паром',
          spoken: 'ночной паром',
          prompt:
            'the empty passenger deck of a ferry at night, long rows of vacant moulded seats, black sea and a distant shore beyond the windows, one strip light flickering at the far end, the whole deck rolling very slightly with the swell',
        },
      ],
    },
    {
      key: 'presence',
      kind: 'select',
      label: 'Что не так',
      hint: 'Одна деталь. Из-за неё становится ясно, что ты здесь не один.',
      defaultValue: 'nothing',
      options: [
        {
          value: 'nothing',
          label: 'Ничего',
          spoken: 'ничего',
          // The honest empty case. It is the default because the format works
          // without a hook and adding one is the user's choice, not ours.
          prompt: 'nothing out of place: the space is simply, completely empty',
        },
        {
          value: 'door',
          label: 'Дверь закрывается впереди',
          spoken: 'дверь',
          prompt: 'far ahead, a door swings quietly shut on its own just before you reach it',
        },
        {
          value: 'light',
          label: 'Свет гаснет позади',
          spoken: 'свет',
          prompt: 'one light in the middle distance goes out, then the next one nearer, then the next',
        },
        {
          value: 'traces',
          label: 'Следы, которых не было',
          spoken: 'следы',
          prompt: 'a fresh line of wet footprints leads away ahead of you across the ground, going the same way you are',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Ты идёшь',
      durationSeconds: 8,
      prompt:
        'First-person point-of-view footage, handheld, natural available light, photorealistic: {{premise}}. The camera moves forward at an ordinary walking pace with the small vertical bob and slight sway of someone walking, breathing audible, footsteps on the ground. {{presence}}. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'none', cameraMotion: 'handheld', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Ты замечаешь',
      durationSeconds: 8,
      // The turn — literally. A POV "reaction" is a head movement, not a cut, so
      // the beat is written as one: slow, then stop, then look.
      prompt:
        'First-person point-of-view footage, handheld, natural available light, photorealistic, same place and same light: {{premise}}. The camera slows, stops, and turns slowly to look — a head turn, unhurried, taking in the space around you. The breathing gets quieter. {{presence}}. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'none', cameraMotion: 'handheld', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Ты там же',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10), and the ending. "You end where you started" is
      // a real beat in an empty place, not a technical convenience — which is why
      // the prompt asks for the return as a walk rather than as a cut.
      prompt:
        'First-person point-of-view footage, handheld, natural available light, photorealistic, same place and same light: {{premise}}. The camera walks on and comes back around to the exact spot this video began from, facing the same way. {{presence}}. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same view of the same place from the same height in the same light — so that the end cuts back to the beginning seamlessly and the walk simply continues. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'none', cameraMotion: 'handheld', quality: 'ultra' },
    },
  ],
}
