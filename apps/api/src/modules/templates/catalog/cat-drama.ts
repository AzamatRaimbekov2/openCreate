// apps/api/src/modules/templates/catalog/cat-drama.ts
// «Кошачья измена» — the AI cat soap opera.
//
// THE FORMAT (researched — see the ADR's sources): the single biggest AI-video
// genre of 2025–26. Two waves: the 2024 "sad cat story" slideshows (@mpminds,
// the fat ginger cat "Chubby"), then the 2025–26 microdramas (@meowmeowaiart,
// Meow Story Time) — betrayal, divorce, a glow-up, revenge, in about 30 seconds.
//
// ONE CORRECTION WORTH WRITING DOWN, because it is the mistake everyone makes:
// this is NOT "Italian brainrot". Italian brainrot (Ballerina Cappuccina,
// Bombardiro Crocodilo, Mar 2025) is AI hybrid creatures with pseudo-Italian
// names and Italian narration — a different genre with different grammar. Do not
// merge them.
//
// THE LOOK, precisely: photoreal fluffy CAT HEADS on HUMAN BODIES — veiny
// forearms, broad shoulders, a suit or a work shirt. Not cats standing on two
// legs. The casting is fixed by the genre: the sympathetic husband is a fat
// ginger tabby, the rival is a sleek black cat in a tailored suit. Huge glossy
// teary eyes. Uncanny, over-saturated, slightly janky — the jank is part of it.
//
// THE ARC is the genre's whole appeal and it is rigidly conventional: he works
// three jobs for her → she lets the rival in → he catches them → she throws him
// out → he cries in the rain holding their kitten → gym montage → he is rich →
// she begs on the street and he walks past. Eight beats. Deviating from the arc
// is how you make a video nobody watches.
//
// THE AUDIO convention is "meow-covers" — sad pop hits (Billie Eilish's "What
// Was I Made For?", Sia's "Unstoppable") re-sung entirely in meows. We cannot
// generate that (no music model will meow on command), so musicPrompt aims at the
// same emotional target through instrumental means: piano ballad → triumphant
// strings, tracking the arc's turn at beat 6.
import type { Template } from '../types'

export const catDrama: Template = {
  id: 'cat-drama',
  category: 'brainrot',
  name: 'Кошачья измена',
  tagline: 'Он работал на трёх работах ради неё. Она впустила другого.',
  description:
    'Самый вирусный ИИ-формат 2026 года: фотореалистичные коты с человеческими телами разыгрывают мыльную оперу ' +
    'про предательство. Восемь битов — уход на работу, разлучник, разоблачение, слёзы под дождём, качалка, ' +
    'месть. Вертикаль 9:16, драматичные реплики, вшитые титры. Арка формата соблюдена до кадра.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{hero}} и предательство',

  // THE AMBIGUOUS ONE, resolved upward on purpose. A cat head on a human body is
  // unmistakably synthetic, which argues for 'description'. But everything else in
  // frame is photoreal: human bodies, a real apartment, a real gym, a rainy street.
  // 'description' is defined as the NON-photoreal tier and this is not that, so the
  // only clean literal fit above it is 'in-player'. The rule when a card sits
  // between two tiers is to take the higher one — over-labelling costs a line of
  // copy, under-labelling a photoreal human drama is a policy exposure, and
  // TikTok's C2PA detection will apply the label here whatever we declare.
  // Not loopable: betrayal → glow-up → revenge, and it ends.
  loopable: false,
  disclosureTier: 'in-player',

  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Персонажи говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'sad emotional piano ballad, melancholic strings, cinematic heartbreak, building slowly to a triumphant orchestral swell',

  // Two knobs. The wife is deliberately NOT one: she is a fixed white cat because
  // the genre's casting is fixed, and a third picker would be a choice nobody
  // wants to make. Both option sets are masculine nominative so the voice lines
  // and the film title decline correctly (see fruit-drama's header on grammar).
  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто главный герой',
      hint: 'Тот, кого предали. Канон формата — толстый рыжий кот.',
      defaultValue: 'ginger',
      options: [
        {
          value: 'ginger',
          label: 'Рыжий кот',
          prompt:
            'a chubby orange tabby cat head on a stocky human body, sad droopy eyes, wearing a worn red flannel work shirt',
        },
        {
          value: 'white',
          label: 'Белый кот',
          prompt:
            'a fluffy white cat head on a lean human body, huge glossy blue eyes, wearing a threadbare grey work jacket',
        },
        {
          value: 'grey',
          label: 'Серый кот',
          prompt:
            'a grey shorthair cat head on a broad human body, tired amber eyes, wearing a stained mechanic’s coverall',
        },
      ],
    },
    {
      key: 'rival',
      kind: 'select',
      label: 'Кто разлучник',
      hint: 'Богатый, наглый, в костюме.',
      defaultValue: 'blackcat',
      options: [
        {
          value: 'blackcat',
          label: 'Чёрный кот',
          prompt:
            'a sleek black cat head on a muscular human body with veiny forearms, smug narrowed green eyes, wearing an expensive tailored charcoal suit and a gold watch',
        },
        {
          value: 'fox',
          label: 'Лис',
          prompt:
            'a sly red fox head on a lean muscular human body, smirking, wearing a sharp navy designer suit and dark sunglasses',
        },
        {
          value: 'wolf',
          label: 'Волк',
          prompt:
            'a grey wolf head on a huge muscular human body, cold yellow eyes, wearing a black leather jacket over a bare chest',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Уход на работу',
      durationSeconds: 8,
      prompt:
        'photorealistic anthropomorphic {{hero}} kisses his wife — a fluffy white cat head on a slender human body in a silk robe — goodbye at the door of a modest apartment, he carries a battered lunchbox, early morning grey light, uncanny hyperreal, cinematic lighting, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      title: { text: 'Он работал на трёх работах ради неё...', position: 'top' },
      voiceover: { text: 'Я вернусь пораньше, любимая. Я обещаю.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Разлучник',
      durationSeconds: 8,
      prompt:
        'the white cat wife in a silk robe opens the apartment door to a photorealistic anthropomorphic {{rival}}, she smiles and places her hand on his chest, he steps inside confidently, warm lamplight, uncanny hyperreal, cinematic lighting, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: 'Он на работе. У нас полно времени.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Возвращение',
      durationSeconds: 8,
      prompt:
        'photorealistic anthropomorphic {{hero}} pushes open his own front door and freezes on the threshold, his glossy eyes stretching wide in horror, the lunchbox slipping from his hand, harsh backlight silhouetting him in the doorway, uncanny hyperreal, cinematic lighting',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: '...Что здесь происходит?', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Изгнание',
      durationSeconds: 8,
      prompt:
        'the white cat wife laughs cruelly and points at the open door while photorealistic anthropomorphic {{rival}} smirks behind her with his arms crossed, a battered suitcase lies open on the floor, photorealistic anthropomorphic {{hero}} stands with his head down, uncanny hyperreal, harsh overhead light, cinematic',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      voiceover: { text: 'Ты жалкий. Убирайся из моего дома.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Дождь',
      durationSeconds: 8,
      // The emotional floor of the arc. The kitten is non-negotiable — it is what
      // the genre cries about.
      prompt:
        'photorealistic anthropomorphic {{hero}} sits alone on a wet curb in pouring rain at night, soaked through, cradling a tiny shivering kitten inside his jacket, enormous tears streaming from his glossy eyes, streetlight flare through the rain, uncanny hyperreal, cinematic, devastating',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'close-up',
        cameraMotion: 'dolly-out',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Не плачь, сынок. Мы справимся. Я обещаю.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Перелом',
      durationSeconds: 8,
      // The turn. Everything after this is the payoff the viewer stayed for.
      prompt:
        'photorealistic anthropomorphic {{hero}} lifts heavy iron in a dark gritty gym at night, sweat running down his fur, jaw clenched, his human body visibly hardening with muscle, hard rim lighting, dust in the air, uncanny hyperreal, cinematic, determined',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'orbit', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Он потерял всё. И начал заново.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Успех',
      durationSeconds: 8,
      prompt:
        'photorealistic anthropomorphic {{hero}}, now muscular and confident in an immaculate black suit, steps out of a matte-black sports car in front of a glass-walled mansion, his grown son at his side, golden hour light, lens flare, uncanny hyperreal, cinematic, triumphant',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'crane', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Через год его имя знал весь город.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Расплата',
      durationSeconds: 8,
      prompt:
        'the white cat wife, now ragged and poor in a torn coat, kneels on a rainy pavement reaching out toward photorealistic anthropomorphic {{hero}} in his black suit, he does not look at her and keeps walking past, cold blue night light, neon reflections, uncanny hyperreal, cinematic, merciless',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Прошу... прости меня... я всё потеряла...', voice: 'Elena' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
