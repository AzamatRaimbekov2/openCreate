// apps/api/src/modules/templates/catalog/fruit-drama.ts
// «Фруктовая измена» — the cheating-fruit soap opera.
//
// THE FORMAT (this is research, not invention — see the ADR's sources):
// Originated 28 Feb 2026 on TikTok (@trombonechef) as the "sad fruit story" /
// "cheating AI fruit" trend: a strawberry wife cheats on her strawberry husband
// with her eggplant boss, and the baby is born an eggplant. Part 2 hit ~25M
// views; the spinoff "Fruit Love Island" cleared 300M. In Russian the trend
// crystallized around one catchphrase, which is beat 5 of this template
// verbatim: «Я клубника, ты клубника — почему у нас родился банан?»
//
// THE LOOK is specific and easy to get wrong. It is NOT a cartoon and NOT a
// Pixar render: it is HYPERREAL MACRO. A photographically real strawberry —
// seed pits, pores, wet specular highlights — with glossy human eyes and a mouth
// cut into the flesh. The fruit's body IS the head. That is why every clip here
// runs styleId 'cinematic' (photorealistic) and not one of the cartoon styles,
// and why the prompts insist on "macro photography" and "glistening flesh".
//
// THE STRUCTURE is eight 8-second beats plus a free title card, because the video
// models generate ~8s natively and creators cut on that grid. Eight beats is the
// canonical arc: setup → affair → suspicion → hospital → reveal → scream → tears
// → aftermath → "PART 2".
//
// WHY THE VARIABLES ARE WHAT THEY ARE:
// The whole joke is that the couple share a fruit and the baby comes out as the
// LOVER's fruit. So there are exactly two knobs — what the couple is, and who the
// lover is — and the punchline writes itself from them.
// The Russian grammar is load-bearing: `couple` options are all FEMININE
// nominative (клубника, вишня, малина) and `lover` options all MASCULINE
// nominative (баклажан, банан, огурец), so beat 5's line — «Я {{couple}}, ты
// {{couple}}, почему у нас родился {{lover}}?» — declines correctly for every
// combination without the template needing a grammar engine. Adding a neuter or
// feminine `lover` option would silently break that line. Don't.
import type { Template } from '../types'

export const fruitDrama: Template = {
  id: 'fruit-drama',
  category: 'brainrot',
  name: 'Фруктовая измена',
  tagline: 'Клубника изменила мужу. Ребёнок родился баклажаном.',
  description:
    'Вирусный формат TikTok: гиперреалистичные фрукты с человеческими глазами разыгрывают мыльную оперу про измену. ' +
    'Восемь битов по 8 секунд — от счастливой семьи до разоблачения в роддоме и кульминационного крика. ' +
    'Съёмка макро, фотореализм, вертикаль 9:16, вшитые реплики. Всё уже написано — выбери, кто кому изменил.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{couple}} и {{lover}}',

  // All three tier models natively do 8s at 9:16 — the invariant the contract
  // test enforces. veo-3-1-fast is the premium tier because it generates the
  // dialogue audio itself, which is how the real videos in this trend are made:
  // the flat, slightly-wrong AI delivery is a load-bearing feature of the format,
  // not a defect to be worked around.
  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Персонажи говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'melancholic soap opera strings, dramatic emotional piano, tense orchestral betrayal theme, cinematic, slow and heavy',

  variables: [
    {
      key: 'couple',
      kind: 'select',
      label: 'Кто пара',
      hint: 'Муж и жена — один и тот же фрукт. В этом и есть шутка.',
      defaultValue: 'strawberry',
      options: [
        { value: 'strawberry', label: 'Клубника', prompt: 'strawberry' },
        { value: 'cherry', label: 'Вишня', prompt: 'cherry' },
        { value: 'raspberry', label: 'Малина', prompt: 'raspberry' },
      ],
    },
    {
      key: 'lover',
      kind: 'select',
      label: 'Кто разлучник',
      hint: 'Ребёнок родится именно им.',
      defaultValue: 'eggplant',
      options: [
        { value: 'eggplant', label: 'Баклажан', prompt: 'eggplant' },
        { value: 'banana', label: 'Банан', prompt: 'banana' },
        { value: 'cucumber', label: 'Огурец', prompt: 'cucumber' },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Счастливая семья',
      durationSeconds: 8,
      prompt:
        'a married couple of anthropomorphic {{couple}} characters with large glossy human-like eyes and expressive mouths cut into their glistening flesh, tiny stubby arms, standing together on a sunlit kitchen counter, the wife wears a tiny floral apron and the husband a small necktie, they hold hands and smile at each other, warm morning light through a window, water droplets beading on their skin, seed pits and pores visible, hyper-realistic macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-in', quality: 'ultra' },
      // The hook. ~70% of this format is watched muted, so beat 1 carries the
      // premise as burned-in text or the viewer scrolls past it.
      title: { text: 'Он думал, что это идеальная семья...', position: 'top' },
      voiceover: { text: 'Милый, я так счастлива. У нас будет малыш.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Измена',
      durationSeconds: 8,
      prompt:
        'the anthropomorphic {{couple}} wife with glossy human-like eyes leans in close to a smug anthropomorphic {{lover}} character wearing a loosened necktie, in a dark office at night, her mouth open in a nervous guilty laugh, venetian blind shadows striping their glistening skin, tense secretive mood, hyper-realistic macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      voiceover: { text: 'Он ничего не узнает. Закрой дверь.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Подозрение',
      durationSeconds: 8,
      prompt:
        'the anthropomorphic {{couple}} husband with narrowed glossy human-like eyes stands frozen in a doorway staring off-frame, his tiny hands clenched, harsh hallway light behind him throwing a long shadow across the kitchen counter, dawning suspicion, hyper-realistic macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: 'Почему она вернулась так поздно?..', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Роддом',
      durationSeconds: 8,
      prompt:
        'the anthropomorphic {{couple}} husband paces anxiously in a sterile white hospital waiting room, tiny hands pressed together, harsh fluorescent light glaring off his wet glistening skin, a nurse silhouette moving behind frosted glass, hyper-realistic macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'pan', quality: 'ultra' },
      voiceover: { text: 'Только бы всё было хорошо. Только бы...', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Разоблачение',
      durationSeconds: 8,
      // The money shot. Everything before it is setup for this frame.
      prompt:
        'a doctor in white gloves presents a newborn baby {{lover}} — a tiny glistening {{lover}} with the same glossy human-like eyes — to the horrified anthropomorphic {{couple}} husband, his eyes stretched wide, his mouth frozen open in silent shock, sterile delivery room, harsh overhead light, the exact moment of realization, hyper-realistic macro photography',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-in', quality: 'ultra' },
      // The verbatim Russian catchphrase the trend is known by. Declines correctly
      // for every couple×lover combination — see the header note on grammar.
      voiceover: {
        text: 'Я {{couple}}... ты {{couple}}... почему у нас родился {{lover}}?!',
        voice: 'Dmitry',
      },
    },
    {
      kind: 'clip',
      beat: 'Крик',
      durationSeconds: 8,
      prompt:
        'extreme macro close-up of the anthropomorphic {{couple}} husband screaming, his mouth stretched impossibly wide showing the red flesh interior, tears streaming from his glossy human-like eyes, juice veins bulging under his skin, harsh dramatic uplighting, pure rage and betrayal, hyper-realistic macro photography',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'handheld',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'ТЫ ЛГАЛА МНЕ! ВСЁ ЭТО ВРЕМЯ!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Слёзы',
      durationSeconds: 8,
      prompt:
        'extreme macro close-up of the anthropomorphic {{couple}} wife crying, one enormous tear rolling slowly down her glistening skin, her glossy human-like eyes red and swollen, her mouth trembling, soft rim light in a dark room, devastating sadness, hyper-realistic macro photography',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Прости меня... я не хотела... я не хотела!', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Развязка',
      durationSeconds: 8,
      prompt:
        'the anthropomorphic {{couple}} husband walks away alone down a rain-soaked night street carrying a tiny suitcase, seen from behind, neon reflections shimmering in the puddles, the {{couple}} wife watching from a lit window far behind him, cold blue light, cinematic melancholy, hyper-realistic macro photography',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Прощай. Ты сама всё выбрала.', voice: 'Dmitry' },
    },
    {
      // Free — a title card costs no credits (generationId stays null and ffmpeg
      // draws it over black). Serialization is the engine of this format: the
      // "PART 2" card is why the viewer follows the account.
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
