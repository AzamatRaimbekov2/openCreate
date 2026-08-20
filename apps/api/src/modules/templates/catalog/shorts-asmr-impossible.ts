// apps/api/src/modules/templates/catalog/shorts-asmr-impossible.ts
// «ASMR: невозможный материал» — the first card of the SHORTS shelf.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. Cutting-ASMR is one of the oldest short-form genres there is: soap
// cutting and kinetic sand in the mid-2010s, then honeycomb, then the "crunchy"
// glass-cutting wave. Its grammar was fixed long before AI touched it — macro
// lens, a wooden board, one object, one blade, no face, no music, no talking.
// The 2025–26 AI turn changed exactly one thing and it is the whole premise: the
// object can now be made of a material it could not possibly be made of. A
// strawberry blown from optical glass. An egg carved from obsidian. The genre's
// entire pleasure is the anticipation of a sound, and the joke is that you do
// not know which sound is coming.
//
// DISCLOSURE TIER: none. The subject is impossible on its face — no real person,
// no real place, no real event, nothing a viewer could mistake for a record of
// something that happened (ADR §12).
//
// LOOPABLE: yes. Three beats, 24s, and the third beat is authored to land the
// fragments back into the silhouette the first beat opened on, so the cut from
// beat 3 to beat 1 reads as a match cut rather than a restart (ADR §10).
//
// THE ONE THING EASY TO GET WRONG — and it is the audio, not the picture.
// Left to itself the model picks the sound, and it picks it from the FORM rather
// than the material: it sees a strawberry, so it produces a wet organic crunch,
// and a wet crunch over shattering glass is not a surprise, it is a mistake the
// viewer can hear. So every option fragment below NAMES the sound the break must
// make and names the sound it must not. That is why the audio direction lives in
// the knob's fragment instead of in the shot prompt: the sound is a property of
// the material, and the material is the knob.
//
// THE SECOND THING, which costs less but costs it every time: hands. A forearm
// in a macro frame gives the model a whole limb to invent, and it invents extra
// knuckles. The frame is cropped AT THE WRIST — a blade and, at most, a hand
// that enters, does one thing, and leaves. No arm, no body, no face, ever.
//
// WHY ALL THREE BEATS ARE A LOCKED-OFF STATIC MACRO: two reasons that happen to
// agree. The genre is a static macro — a moving camera reads as a product advert
// and breaks the trance. And a loop needs the last frame to rhyme with the first,
// which is free when the camera never moved and nearly impossible when it did.
import type { Template } from '../types'

// Pasted verbatim into all three prompts. It carries the two constraints ADR §11
// makes prompt-level rather than overlay-level: the platform's own UI eats the
// bottom ~26% and the right ~17% of a 9:16 frame, so nothing load-bearing may sit
// there; and the model renders text badly enough that we never ask it to render
// any. Nothing here is decorative — every clause is a failure mode.
const FRAME =
  'FRAMING: vertical 9:16 format, the board and the object held in the UPPER TWO THIRDS of the frame with clear headroom above them, the LOWER THIRD of the frame left empty and uncluttered, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no signage, no labels, no packaging, no logos, no watermark, no user-interface elements. ' +
  'NO PERSON IN FRAME: no face, no body, no forearm — the frame is cropped at the wrist, only a bare hand and the blade may enter from the right edge.'

export const shortsAsmrImpossible: Template = {
  id: 'shorts-asmr-impossible',
  category: 'shorts',
  name: 'ASMR: невозможный материал',
  tagline: 'Клубника из стекла. Нож. И звук, которого не должно быть.',
  description:
    'Макро-ASMR по канону жанра: деревянная доска, один предмет, одно лезвие — и предмет сделан из материала, ' +
    'из которого он быть не может. Три бита по 8 секунд: предмет в кадре, разрез, осколки. ' +
    'Ни лица, ни рук выше запястья, ни единой надписи в кадре. Финальный бит возвращает композицию к первому — ' +
    'ролик зацикливается без шва, а повтор на вертикальных платформах считается новым просмотром.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'ASMR: {{object}}',

  // See the header: impossible on its face, and beat 3 lands the fragments back
  // into the silhouette beat 1 opened on.
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
    standard: 'Сейчас не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же генерирует звук — в ASMR это половина ролика',
  },

  // musicPrompt is deliberately absent, and that is a decision rather than an
  // omission: a music bed under cutting-ASMR destroys the thing the format
  // exists for. The audio panel should open empty here.

  // ONE knob, and it is the on-screen one ADR §9 requires: it changes the
  // subject, the material, the light and the sound all at once. A second knob
  // would have to be cosmetic — the board, the blade and the framing are the
  // genre, not choices.
  variables: [
    {
      key: 'object',
      kind: 'select',
      label: 'Из чего сделан предмет',
      hint: 'Материал задаёт и картинку, и звук разлома. Это и есть весь ролик.',
      defaultValue: 'glass-strawberry',
      options: [
        {
          value: 'glass-strawberry',
          label: 'Клубника из стекла',
          spoken: 'клубника из стекла',
          prompt:
            'a single strawberry blown entirely from clear optical glass, its seeds rendered as tiny air bubbles suspended inside the glass, the leafy crown in frosted green glass, hard specular highlights and caustics thrown onto the wood beneath it; WHEN IT BREAKS IT MUST SOUND LIKE GLASS — a bright brittle high-frequency chime and a spray of fine tinkling shards, never a wet organic crunch, never a juicy squelch',
        },
        {
          value: 'obsidian-egg',
          label: 'Яйцо из обсидиана',
          spoken: 'яйцо из обсидиана',
          prompt:
            'a chicken egg carved from polished black obsidian, glassy conchoidal surface catching one long hard highlight, absolutely opaque, unnaturally heavy where it rests on the wood; WHEN IT BREAKS IT MUST SOUND LIKE STONE — a dry low crack followed by the dull clatter of heavy shards falling onto wood, never a wet organic crunch, never a shell squelch',
        },
        {
          value: 'amber-peach',
          label: 'Персик из янтаря',
          spoken: 'персик из янтаря',
          prompt:
            'a peach turned from a single block of solid honey-coloured amber, warm light passing straight through it and glowing on the far side, a faint fossil inclusion suspended at its heart, the cleft in its side polished smooth; WHEN IT BREAKS IT MUST SOUND LIKE HARD RESIN — one deep dry snap and a short low rattle of thick chunks, never a wet organic crunch, never a juicy squelch',
        },
        {
          value: 'salt-lemon',
          label: 'Лимон из соли',
          spoken: 'лимон из соли',
          prompt:
            'a lemon carved from a single block of pink rock salt, coarse crystalline surface, translucent pink at the thin edges, a light dusting of loose grains around its base on the wood; WHEN IT BREAKS IT MUST SOUND LIKE DRY CRYSTAL — a granular crumbling crunch and a hiss of loose grains scattering across the board, never a wet fruit squelch',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Предмет',
      durationSeconds: 8,
      // The anticipation beat. Nothing happens on purpose: the whole genre runs
      // on the several seconds before contact, and a model given something to do
      // here will cut early and spend the payoff in beat 1.
      prompt:
        'extreme macro photography, shallow depth of field: {{object}} rests dead centre on a dark oiled walnut board, one soft window light raking across it from the left, fine dust motes drifting in the beam, the wood grain sharp beneath it. The camera does not move. Nothing is cut yet. The polished tip of a heavy chef knife slides slowly into frame from the right edge and stops beside the object without touching it. ' +
        FRAME,
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
    },
    {
      kind: 'clip',
      beat: 'Разрез',
      durationSeconds: 8,
      // Contact and fracture. "Does not deform, does not squash, does not bleed"
      // is here because a model that has decided the subject is fruit will squash
      // it — and a strawberry that squashes is a strawberry, not a glass one.
      prompt:
        'extreme macro photography, shallow depth of field, same locked-off camera and same dark oiled walnut board and same raking window light: the heavy chef knife presses down onto {{object}} and the object FRACTURES under the blade — it does not deform, does not squash, does not bleed, it splits along hard clean fracture lines and the pieces fall apart onto the board in slow motion, fine fragments scattering outward, dust lifting in the light beam. ' +
        FRAME,
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
    },
    {
      kind: 'clip',
      beat: 'Осколки',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). It is a compositional rhyme, not an identity:
      // the object cannot become whole again, so the fragments are directed to
      // settle into the SAME silhouette, in the SAME place, under the SAME light,
      // while the blade withdraws the way it entered in beat 1. Cut back to beat 1
      // and the eye reads a match cut rather than a restart.
      prompt:
        'extreme macro photography, shallow depth of field, same locked-off camera and same dark oiled walnut board and same raking window light: the last fragments of {{object}} tumble to a stop and settle into a tight cluster dead centre of the board, occupying exactly the same silhouette and the same position the whole object occupied before it was cut, the loose grains and dust coming to rest around them. The knife withdraws slowly out through the right edge of frame the same way it came in. The final frame matches the opening composition of this video exactly: the same centred mass on the same board under the same light, camera unmoved. ' +
        FRAME,
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
    },
  ],
}
