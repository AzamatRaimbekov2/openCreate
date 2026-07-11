// apps/api/src/modules/templates/catalog/talking-food.ts
// «Говорящие фрукты» — the talking-produce short.
//
// THE FORMAT: descended visually from Annoying Orange (2009 — real fruit, a
// composited human mouth, a kitchen counter), but reborn in late 2025 as an AI
// format once lip-sync tooling made "make any object talk" a one-click product.
// Today's live sub-formats: nutrition facts, two fruits arguing over who is
// healthier, fruit roasts, and whispered ASMR. The cheating-fruit drama
// (fruit-drama.ts) is actually this format's mutated descendant — the same
// characters, given a plot.
//
// THE LOOK, and the ONE thing that separates it from fruit-drama: the fruit stays
// a WHOLE, INTACT, PHOTOREAL FRUIT. No arms. No legs. No clothes. Two glossy
// cartoon eyes sit ON the skin in the upper third, and a mouth is cut into the
// middle, opening into the flesh — you see teeth, tongue, and the interior colour.
// The skin stretches and deforms as it talks. White seamless studio or a kitchen
// cutting board. Getting this wrong (giving it a body) turns it into the drama
// template, which is a different product.
//
// WHY THIS ONE IS THREE BEATS AND NOT EIGHT: unlike the dramas, this format does
// not serialize. It is a single 8–20s clip with a hook, a payload, and a CTA. Any
// longer and it stops being the format. Three beats is also why it is the cheap
// way into the catalog — 168 credits on the draft tier against the drama's 448.
//
// WHY IT HAS A FREE-TEXT KNOB, and the dramas don't: the dramas ARE their script
// (the plot is the product; letting the user rewrite it is letting them break it).
// Here the script is the *only* thing that varies — the whole format is "a fruit
// says a thing" — so `script` is a text variable. It is substituted into the
// spoken line and NEVER into a visual prompt, per the rule in types.ts.
import type { Template } from '../types'

export const talkingFood: Template = {
  id: 'talking-food',
  category: 'brainrot',
  name: 'Говорящие фрукты',
  tagline: 'Фрукт открывает глаза и говорит то, что ты написал.',
  description:
    'Фотореалистичный целый фрукт с мультяшными глазами и ртом, прорезанным в мякоти, обращается прямо в камеру. ' +
    'Формат фактов, споров и ASMR — три бита по 8 секунд: хук, реплика, финал. ' +
    'Ты пишешь, что он скажет; остальное уже настроено. Самый дешёвый вход в каталог.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Говорящая {{food}}',

  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Фрукт говорит сам — модель генерирует речь вместе с видео',
  },

  // Deliberately no musicPrompt: this format is music-free by convention (the
  // voice and the foley ARE the audio, and the ASMR variant depends on it). A
  // template with no opinion should say nothing rather than invent one.

  variables: [
    {
      key: 'food',
      kind: 'select',
      label: 'Кто говорит',
      defaultValue: 'strawberry',
      options: [
        { value: 'strawberry', label: 'Клубника', prompt: 'strawberry' },
        { value: 'banana', label: 'Банан', prompt: 'banana' },
        { value: 'avocado', label: 'Авокадо', prompt: 'avocado, cut in half with the pit visible' },
        { value: 'orange', label: 'Апельсин', prompt: 'orange' },
        { value: 'cucumber', label: 'Огурец', prompt: 'cucumber' },
        { value: 'carrot', label: 'Морковь', prompt: 'carrot' },
      ],
    },
    {
      key: 'mood',
      kind: 'select',
      label: 'Характер',
      hint: 'Задаёт и мимику, и подачу.',
      defaultValue: 'expert',
      options: [
        {
          value: 'expert',
          label: 'Дружелюбный эксперт',
          prompt: 'friendly warm confident expression, bright upbeat energy, direct eye contact',
        },
        {
          value: 'sassy',
          label: 'Дерзкий и саркастичный',
          prompt: 'smug sarcastic smirk, one brow raised, half-lidded condescending eyes',
        },
        {
          value: 'asmr',
          label: 'Шёпот ASMR',
          prompt:
            'soft calm whispering expression, half-lidded intimate eyes, very close to the lens, glistening wet texture in extreme detail',
        },
      ],
    },
    {
      key: 'voice',
      kind: 'select',
      label: 'Голос',
      defaultValue: 'Svetlana',
      // `spoken` here is the catalog voice id — the literal string substituted into
      // the voiceover's `voice` field. `label` is what the picker shows. The
      // service validates the resolved id against the live catalog's voice list, so
      // a voice retired by the provider fails loudly at instantiation instead of
      // silently producing a wrong-sounding track later.
      options: [
        { value: 'Svetlana', label: 'Светлана — женский, тёплый', prompt: '', spoken: 'Svetlana' },
        { value: 'Elena', label: 'Елена — женский, звонкий', prompt: '', spoken: 'Elena' },
        { value: 'Dmitry', label: 'Дмитрий — мужской, низкий', prompt: '', spoken: 'Dmitry' },
        { value: 'Nikolai', label: 'Николай — мужской, глубокий', prompt: '', spoken: 'Nikolai' },
      ],
    },
    {
      key: 'script',
      kind: 'text',
      label: 'Что он говорит',
      hint: 'Одна-две фразы. Короче — лучше: формат живёт на 8 секундах.',
      defaultValue: 'А ты знал, что во мне больше витамина C, чем в апельсине? Проверь этикетку.',
      maxLength: 300,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Хук',
      durationSeconds: 8,
      prompt:
        'extreme macro close-up of a photorealistic whole {{food}}, completely intact with real skin texture, pores and water droplets, with two large glossy cartoon eyes on its upper surface and a wide mouth cut into its flesh revealing teeth and a tongue and the coloured interior, the eyes snap open and it looks directly into the lens, seamless white studio background, hard key light, {{mood}}',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'dolly-in',
        quality: 'ultra',
      },
      title: { text: 'Стоп. Ты ешь это неправильно.', position: 'top' },
      voiceover: { text: 'Стоп. Ты ешь меня неправильно.', voice: '{{voice}}' },
    },
    {
      kind: 'clip',
      beat: 'Реплика',
      durationSeconds: 8,
      prompt:
        'extreme macro close-up of a photorealistic whole {{food}} with glossy cartoon eyes and a mouth cut into its flesh, talking animatedly straight to camera, the mouth stretching and deforming the skin as it speaks, juice glistening on its lips, seamless white studio background, hard key light, {{mood}}',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
      // The only beat that carries the user's own words.
      voiceover: { text: '{{script}}', voice: '{{voice}}' },
    },
    {
      kind: 'clip',
      beat: 'Финал',
      durationSeconds: 8,
      prompt:
        'extreme macro close-up of a photorealistic whole {{food}} with glossy cartoon eyes, finishing its sentence with a satisfied closed-mouth smile and a slow deliberate wink, a single droplet rolling down its glistening skin, seamless white studio background, hard key light, {{mood}}',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'dolly-out',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Согласен? Напиши в комментариях.', voice: '{{voice}}' },
    },
  ],
}
