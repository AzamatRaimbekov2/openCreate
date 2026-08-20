// apps/api/src/modules/templates/catalog/shorts-talking-object.ts
// «Говорящий предмет» — one household appliance, photoreal, with a grievance.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The talking inanimate object is the oldest trick in animation and the
// most reliable one in short form: Annoying Orange (2009) built an audience of
// millions out of a face composited onto fruit, and the late-2025 one-click
// lip-sync tools brought the format back at scale. The catalog already carries
// its produce branch («Говорящие фрукты»). This is its appliance branch, and the
// difference is not the subject — it is the register. The fruit is manic. The
// appliance is tired, and it has been keeping notes.
//
// DISCLOSURE TIER: description. The kitchen and the appliance are photoreal, and
// the register is deadpan domestic rather than fantastical, so the label belongs
// in the expanded description (ADR §12).
//
// LOOPABLE: yes, and almost for free: the camera never moves, so the loop only
// needs the face to go back where it came from. Beat 1 opens on an ordinary
// dormant appliance and the face forms; beat 3 lets the face dissolve back into
// plain geometry, landing on the same dormant frame. Cut back and it starts over
// (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: GIVING IT ARMS AND LEGS. A model asked for a
// talking microwave will, unprompted, grow it stubby limbs, tilt it, hop it along
// the counter and animate a cartoon face floating on its front panel. The moment
// that happens the premise is gone — it is no longer a microwave that talks, it is
// a generic 3D cartoon character shaped like a microwave, which is a different and
// far more crowded product. So the rule, stated in every option fragment and again
// in every shot: THE OBJECT STAYS RIGID AND BOLTED IN PLACE. No arms, no legs, no
// body, no leaning, no hopping, no gesturing. Only the mouth and the eyes move.
//
// AND THE MOUTH IS NOT DRAWN ON — it is the geometry the appliance already has.
// The microwave's hinged glass door IS the mouth. The washing machine's drum
// hatch IS the mouth. That is the whole craft of the format: nothing is added to
// the object, its existing parts are simply re-read as a face. A mouth painted
// onto a flat panel reads as a sticker and undoes the effect.
//
// GRAMMAR (load-bearing, same discipline as brick-heist.ts): every `object`
// option is FEMININE NOMINATIVE — микроволновка, стиральная машина, посудомойка,
// кофемашина. That is what lets the film title «{{object}} недовольна» and the
// closing line agree for every combination without a grammar engine. It is also
// why the option set is appliances with a hinged door rather than, say, «чайник»
// (masculine) or «холодильник» (masculine): a masculine option silently breaks
// «недовольна». Do not add one.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11 — and the text clause is
// doing real work in a kitchen, which is a room full of branded packaging, dial
// markings and control-panel legends the model will otherwise reproduce as
// garbled lettering.
const FRAME =
  'FRAMING: vertical 9:16 format, the appliance held in the UPPER TWO THIRDS of the frame with clear headroom above it, the LOWER THIRD of the frame left as empty uncluttered counter or floor, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no brand names, no control-panel legends, no dial markings, no product packaging, no logos, no watermark, no digital display showing anything. ' +
  'NO PERSON IN FRAME: nobody visible, no hands, no face, no reflection of a person. ' +
  'THE CAMERA NEVER MOVES: locked off on a tripod at counter height, no pan, no push, no drift, identical framing for the entire shot.'

// Repeated in every shot rather than only in the option fragments, because it is
// the failure mode the whole template turns on and one statement of it is not
// enough — see the header.
const RIGID =
  'THE APPLIANCE STAYS COMPLETELY RIGID AND IN PLACE: it has no arms, no legs and no body, it does not lean, tilt, hop, walk, bounce or gesture, it does not move from its position by a single centimetre. ONLY THE MOUTH AND THE EYES MOVE, and they are not drawn or painted on — they are formed out of the appliance’s own existing parts.'

export const shortsTalkingObject: Template = {
  id: 'shorts-talking-object',
  category: 'shorts',
  name: 'Говорящий предмет',
  tagline: 'Микроволновка хочет поговорить. Дверца — это её рот.',
  description:
    'Один бытовой прибор, снятый фотореалистично, с неподвижной камерой — и он говорит. ' +
    'Рот и глаза сделаны из его собственной геометрии: дверца открывается как рот, решётки и ручки становятся глазами. ' +
    'Ни рук, ни ног, ни тела — прибор не двигается с места, двигается только лицо. ' +
    'Три бита по 8 секунд: он заговорил, он предъявляет счёт, он снова притворяется техникой. ' +
    'Финальный бит возвращает кадр к первому — ролик зацикливается.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{object}} недовольна',

  // See the header: a photoreal kitchen, but an appliance with a face is impossible
  // and no person is ever in frame. Beat 3 returns to the dormant appliance beat 1
  // opened on.
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
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же даёт прибору собственную речь и попадает в «губы»',
  },

  musicPrompt:
    'sparse deadpan sitcom underscore, single muted electric piano notes, dry brushed snare, quiet room tone, faintly ominous, unhurried, no vocals',

  // TWO knobs, both on-screen (ADR §9). `object` replaces the subject entirely;
  // `grievance` is not merely a spoken line — each option also puts its EVIDENCE
  // in the frame (the unwashed stack, the new appliance still in its plastic), so
  // turning it changes the picture as well as the complaint.
  variables: [
    {
      key: 'object',
      kind: 'select',
      label: 'Кто говорит',
      hint: 'Женский род — так требует название и финальная реплика.',
      defaultValue: 'microwave',
      options: [
        {
          value: 'microwave',
          label: 'Микроволновка',
          spoken: 'микроволновка',
          prompt:
            'an ordinary white countertop microwave oven, photorealistic, standing on a kitchen counter. ITS HINGED GLASS DOOR IS ITS MOUTH — the door swings open and shut to form speech, the dark interior visible inside as it opens. ITS EYES are the two round control dials on its front panel, which have become eyes and blink and look',
        },
        {
          value: 'washer',
          label: 'Стиральная машина',
          spoken: 'стиральная машина',
          prompt:
            'an ordinary white front-loading washing machine, photorealistic, standing in a small utility corner. ITS ROUND DRUM HATCH IS ITS MOUTH — the circular glass door swings open and shut to form speech, the dark drum visible inside as it opens. ITS EYES are the control dial and the detergent drawer handle above the hatch, which have become eyes and blink and look',
        },
        {
          value: 'dishwasher',
          label: 'Посудомойка',
          spoken: 'посудомойка',
          prompt:
            'an ordinary stainless steel dishwasher, photorealistic, built in under a kitchen counter. ITS DROP-DOWN DOOR IS ITS MOUTH — the wide door hinges open and shut to form speech, the loaded racks visible inside as it opens. ITS EYES are the two small round indicator recesses on the top edge of the door, which have become eyes and blink and look',
        },
        {
          value: 'coffeemachine',
          label: 'Кофемашина',
          spoken: 'кофемашина',
          prompt:
            'an ordinary black espresso machine, photorealistic, standing on a kitchen counter. ITS BREW GROUP OPENING IS ITS MOUTH — the round opening beneath the head widens and closes to form speech. ITS EYES are the two pressure gauges on its front, whose needles have become pupils that swivel and look',
        },
      ],
    },
    {
      key: 'grievance',
      kind: 'select',
      label: 'На что жалуется',
      hint: 'Каждый вариант ещё и меняет кадр — улика лежит рядом.',
      defaultValue: 'dishes',
      options: [
        {
          value: 'dishes',
          label: 'На немытую посуду',
          spoken: 'Эта посуда стоит здесь со вторника',
          prompt: 'a leaning stack of unwashed plates and a crusted pan piled on the counter right beside it',
        },
        {
          value: 'mess',
          label: 'На то, что внутри',
          spoken: 'То, что взорвалось внутри меня в среду, всё ещё внутри меня',
          prompt: 'dried spattered residue baked onto every surface around it and a scatter of crumbs across the counter',
        },
        {
          value: 'night',
          label: 'На ночные визиты',
          spoken: 'Вы приходите ко мне в три часа ночи. Каждую ночь',
          prompt: 'the room dark except for one small under-cabinet light, deep night, a single chair pushed back from the table',
        },
        {
          value: 'replacement',
          label: 'На нового соседа',
          spoken: 'Тот, что рядом, новее меня. Я всё понимаю',
          prompt: 'a brand-new identical appliance standing right next to it on the counter, still half-wrapped in factory plastic film',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Она заговорила',
      durationSeconds: 8,
      // Opens dormant. The loop depends on this frame existing, and so does the
      // gag: the beat has to spend a moment being an ordinary kitchen before the
      // face appears in it.
      prompt:
        'Photorealistic domestic kitchen interior, ordinary available light: {{object}}. {{grievance}}. The shot opens on the appliance completely still and dormant, an unremarkable kitchen. Then its eyes open and its mouth-door parts, and it begins to speak — calm, tired, quiet. ' +
        RIGID +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Нам надо поговорить. Я живу здесь дольше вас.', voice: 'Svetlana' },
    },
    {
      kind: 'clip',
      beat: 'Счёт',
      durationSeconds: 8,
      // The complaint, and the only beat where the evidence is actually looked at.
      // The eyes flick to it — which is a face gesture, not a body one, so it does
      // not break RIGID.
      prompt:
        'Photorealistic domestic kitchen interior, same locked-off camera and same available light: {{object}}. {{grievance}}. It is speaking steadily now, the mouth-door working, and its eyes flick sideways towards the mess beside it and back to the camera. ' +
        RIGID +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: '{{grievance}}. Я считаю. Я всё считаю.', voice: 'Svetlana' },
    },
    {
      kind: 'clip',
      beat: 'Снова техника',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). The face does not fade out artistically — it
      // stops being a face, which is both the funnier ending and the exact frame
      // beat 1 opened on.
      prompt:
        'Photorealistic domestic kitchen interior, same locked-off camera and same available light: {{object}}. {{grievance}}. It finishes its sentence, the mouth-door closes flush, the eyes close and the dials and gauges become ordinary dials and gauges again. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same dormant appliance in the same kitchen from the same angle in the same light, no face, nothing moving — so that the end cuts back to the beginning seamlessly. ' +
        RIGID +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Ладно. Забудьте. Я ничего не говорила.', voice: 'Svetlana' },
    },
  ],
}
