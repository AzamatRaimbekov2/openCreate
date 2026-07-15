// packages/contracts/src/soul.ts
// AI Soul Studio: the STRUCTURED character specification a user builds from a
// constructor, and the pure functions that turn it into the text a model sees.
//
// ADR: docs/wiki/decisions/ai-soul-studio.md
//
// THE ONE RULE THIS FILE ENCODES (same as presets.ts §3): a soul is structure,
// never prose. The web renders the pickers from these tables; the API composes
// the description and every portrait prompt from the SAME tables. If the client
// concatenated fragments and shipped the result as `prompt`, the stored entity
// description would be fragment soup — reopening the constructor could not
// round-trip it, and changing one phrase would need a new SPA build.
//
// WHY STYLE IS NOT COMPOSED HERE, even though `soul.styleId` exists: the style
// is a PRESET axis (presets.ts), and it carries a negative prompt. A soul's
// composed text is the SUBJECT only — "a woman with an iron arm", never "Pixar
// style, a woman with an iron arm". That separation is load-bearing twice over:
//   · entity.description is derived from it, and the entity gets tagged into
//     other scenes later, where a DIFFERENT style may apply. Baking the style in
//     would fight the scene's own style at generation time.
//   · the style's negative ("photorealistic, live action" for disney) only
//     reaches the model through applyPromptPreset. Composing the style fragment
//     here would smuggle in the positive half and silently drop the negative.
// So: soulPromptPreset(soul) hands the style (and the reference-sheet framing)
// to applyPromptPreset, which owns both halves. See composePortraitPrompt.
import { z } from 'zod'
import type { PresetOption } from './presets'
import { styleIdSchema } from './presets'

// ─────────────────────────────────────────────────────────────────────────────
// The single-select axes. Every one of them is OPTIONAL in the schema: an unset
// axis contributes nothing to the prompt. (presets.ts uses a 'none' sentinel
// instead; here the tables would carry ten dead rows to say the same thing, and
// an empty picker already reads as "no preference".)
// ─────────────────────────────────────────────────────────────────────────────

export const archetypeSchema = z.enum([
  'female',
  'male',
  'androgynous',
  'child',
  'elder',
  'creature',
  'robot',
  'anthro',
])
export type Archetype = z.infer<typeof archetypeSchema>

export const ARCHETYPES = {
  female: { id: 'female', label: 'Женщина', fragment: 'a woman' },
  male: { id: 'male', label: 'Мужчина', fragment: 'a man' },
  androgynous: { id: 'androgynous', label: 'Андрогин', fragment: 'an androgynous person' },
  child: { id: 'child', label: 'Ребёнок', fragment: 'a child' },
  elder: { id: 'elder', label: 'Старик', fragment: 'an elderly person' },
  creature: { id: 'creature', label: 'Существо', fragment: 'a fantasy creature, humanoid' },
  robot: { id: 'robot', label: 'Робот', fragment: 'a humanoid robot, android' },
  anthro: { id: 'anthro', label: 'Антропоморф', fragment: 'an anthropomorphic animal character' },
} satisfies Record<Archetype, PresetOption>

export const ageSchema = z.enum(['teen', 'young-adult', 'adult', 'middle-aged', 'old', 'ageless'])
export type Age = z.infer<typeof ageSchema>

export const AGES = {
  teen: { id: 'teen', label: 'Подросток', fragment: 'teenage' },
  'young-adult': { id: 'young-adult', label: 'Молодой', fragment: 'in their early twenties' },
  adult: { id: 'adult', label: 'Взрослый', fragment: 'in their thirties' },
  'middle-aged': { id: 'middle-aged', label: 'Средних лет', fragment: 'middle-aged' },
  old: { id: 'old', label: 'Пожилой', fragment: 'old, deeply wrinkled' },
  ageless: { id: 'ageless', label: 'Вне возраста', fragment: 'ageless, timeless features' },
} satisfies Record<Age, PresetOption>

export const buildSchema = z.enum([
  'petite',
  'slim',
  'athletic',
  'muscular',
  'heavy',
  'towering',
  'hulking',
])
export type Build = z.infer<typeof buildSchema>

export const BUILDS = {
  petite: { id: 'petite', label: 'Миниатюрное', fragment: 'petite, small frame' },
  slim: { id: 'slim', label: 'Худощавое', fragment: 'slim, lean build' },
  athletic: { id: 'athletic', label: 'Атлетичное', fragment: 'athletic, toned build' },
  muscular: { id: 'muscular', label: 'Мускулистое', fragment: 'heavily muscular build' },
  heavy: { id: 'heavy', label: 'Грузное', fragment: 'heavy-set, broad build' },
  towering: { id: 'towering', label: 'Высокое', fragment: 'towering, unusually tall' },
  hulking: { id: 'hulking', label: 'Громадное', fragment: 'hulking, massive frame' },
} satisfies Record<Build, PresetOption>

// Hair splits into COLOUR (an adjective) and STYLE (a noun phrase) so the
// composer can join them into one natural phrase — "platinum blonde long
// flowing hair" reads to a text encoder as one concept, where "blonde hair,
// long hair" reads as two competing ones. See composeHair.
export const hairColorSchema = z.enum([
  'black',
  'brown',
  'blonde',
  'auburn',
  'red',
  'white',
  'silver',
  'blue',
  'pink',
  'green',
  'purple',
])
export type HairColor = z.infer<typeof hairColorSchema>

export const HAIR_COLORS = {
  black: { id: 'black', label: 'Чёрные', fragment: 'jet-black' },
  brown: { id: 'brown', label: 'Каштановые', fragment: 'chestnut brown' },
  blonde: { id: 'blonde', label: 'Светлые', fragment: 'platinum blonde' },
  auburn: { id: 'auburn', label: 'Русые', fragment: 'ash auburn' },
  red: { id: 'red', label: 'Рыжие', fragment: 'fiery red' },
  white: { id: 'white', label: 'Белые', fragment: 'snow-white' },
  silver: { id: 'silver', label: 'Седые', fragment: 'silver-grey' },
  blue: { id: 'blue', label: 'Синие', fragment: 'electric blue' },
  pink: { id: 'pink', label: 'Розовые', fragment: 'candy pink' },
  green: { id: 'green', label: 'Зелёные', fragment: 'emerald green' },
  purple: { id: 'purple', label: 'Фиолетовые', fragment: 'deep violet' },
} satisfies Record<HairColor, PresetOption>

export const hairStyleSchema = z.enum([
  'short',
  'long',
  'ponytail',
  'braided',
  'curly',
  'afro',
  'mohawk',
  'buzzcut',
  'dreadlocks',
  'messy',
  'topknot',
])
export type HairStyle = z.infer<typeof hairStyleSchema>

// Every fragment ends in the word "hair" (or is a hairstyle noun) so it also
// stands alone when no colour is picked. ("Bald" is deliberately NOT here — it
// is a TRAIT: it has no colour, and treating it as a style would force the
// composer to special-case "jet-black bald".)
export const HAIR_STYLES = {
  short: { id: 'short', label: 'Короткие', fragment: 'short cropped hair' },
  long: { id: 'long', label: 'Длинные', fragment: 'long flowing hair' },
  ponytail: { id: 'ponytail', label: 'Хвост', fragment: 'hair tied in a high ponytail' },
  braided: { id: 'braided', label: 'Косы', fragment: 'braided hair' },
  curly: { id: 'curly', label: 'Кудрявые', fragment: 'thick curly hair' },
  afro: { id: 'afro', label: 'Афро', fragment: 'voluminous afro hair' },
  mohawk: { id: 'mohawk', label: 'Ирокез', fragment: 'shaved sides with a tall mohawk' },
  buzzcut: { id: 'buzzcut', label: 'Ёжик', fragment: 'military buzzcut hair' },
  dreadlocks: { id: 'dreadlocks', label: 'Дреды', fragment: 'long dreadlocks' },
  messy: { id: 'messy', label: 'Растрёпанные', fragment: 'messy unkempt hair' },
  topknot: { id: 'topknot', label: 'Пучок', fragment: 'hair gathered in a topknot' },
} satisfies Record<HairStyle, PresetOption>

export const eyeColorSchema = z.enum([
  'brown',
  'blue',
  'green',
  'hazel',
  'grey',
  'amber',
  'red',
  'gold',
  'violet',
  'black',
])
export type EyeColor = z.infer<typeof eyeColorSchema>

export const EYE_COLORS = {
  brown: { id: 'brown', label: 'Карие', fragment: 'warm brown eyes' },
  blue: { id: 'blue', label: 'Голубые', fragment: 'pale blue eyes' },
  green: { id: 'green', label: 'Зелёные', fragment: 'bright green eyes' },
  hazel: { id: 'hazel', label: 'Ореховые', fragment: 'hazel eyes' },
  grey: { id: 'grey', label: 'Серые', fragment: 'cold grey eyes' },
  amber: { id: 'amber', label: 'Янтарные', fragment: 'amber eyes' },
  red: { id: 'red', label: 'Красные', fragment: 'blood-red eyes' },
  gold: { id: 'gold', label: 'Золотые', fragment: 'molten gold eyes' },
  violet: { id: 'violet', label: 'Фиолетовые', fragment: 'violet eyes' },
  black: { id: 'black', label: 'Чёрные', fragment: 'solid black eyes, no visible sclera' },
} satisfies Record<EyeColor, PresetOption>

export const skinSchema = z.enum([
  'fair',
  'olive',
  'tan',
  'dark',
  'ebony',
  'pale',
  'weathered',
  'metallic',
  'scaled',
  'furred',
  'stone',
])
export type Skin = z.infer<typeof skinSchema>

export const SKINS = {
  fair: { id: 'fair', label: 'Светлая', fragment: 'fair skin' },
  olive: { id: 'olive', label: 'Оливковая', fragment: 'olive skin' },
  tan: { id: 'tan', label: 'Загорелая', fragment: 'sun-tanned skin' },
  dark: { id: 'dark', label: 'Смуглая', fragment: 'dark brown skin' },
  ebony: { id: 'ebony', label: 'Тёмная', fragment: 'deep ebony skin' },
  pale: { id: 'pale', label: 'Бледная', fragment: 'porcelain-pale skin' },
  weathered: { id: 'weathered', label: 'Обветренная', fragment: 'weathered, sun-cracked skin' },
  metallic: { id: 'metallic', label: 'Металл', fragment: 'brushed metal plating instead of skin' },
  scaled: { id: 'scaled', label: 'Чешуя', fragment: 'fine reptilian scales instead of skin' },
  furred: { id: 'furred', label: 'Шерсть', fragment: 'short dense fur instead of skin' },
  stone: { id: 'stone', label: 'Камень', fragment: 'cracked stone skin' },
} satisfies Record<Skin, PresetOption>

export const outfitSchema = z.enum([
  'casual',
  'streetwear',
  'suit',
  'armor',
  'cyberpunk',
  'robe',
  'military',
  'leather-jacket',
  'kimono',
  'lab-coat',
  'royal',
  'post-apocalyptic',
  'sportswear',
  'rags',
])
export type Outfit = z.infer<typeof outfitSchema>

export const OUTFITS = {
  casual: { id: 'casual', label: 'Повседневная', fragment: 'simple casual clothes' },
  streetwear: { id: 'streetwear', label: 'Стритвир', fragment: 'oversized streetwear, hoodie' },
  suit: { id: 'suit', label: 'Костюм', fragment: 'sharp tailored business suit' },
  armor: { id: 'armor', label: 'Доспех', fragment: 'battle-worn plate armor' },
  cyberpunk: { id: 'cyberpunk', label: 'Киберпанк', fragment: 'cyberpunk techwear with glowing trim' },
  robe: { id: 'robe', label: 'Мантия', fragment: 'flowing fantasy robe' },
  military: { id: 'military', label: 'Военная', fragment: 'military fatigues and webbing' },
  'leather-jacket': { id: 'leather-jacket', label: 'Косуха', fragment: 'worn leather biker jacket' },
  kimono: { id: 'kimono', label: 'Кимоно', fragment: 'traditional patterned kimono' },
  'lab-coat': { id: 'lab-coat', label: 'Халат', fragment: 'white laboratory coat' },
  royal: { id: 'royal', label: 'Королевская', fragment: 'opulent royal garments, gold embroidery' },
  'post-apocalyptic': {
    id: 'post-apocalyptic',
    label: 'Постапокалипсис',
    fragment: 'scavenged post-apocalyptic gear, straps and goggles',
  },
  sportswear: { id: 'sportswear', label: 'Спортивная', fragment: 'athletic sportswear' },
  rags: { id: 'rags', label: 'Лохмотья', fragment: 'tattered rags' },
} satisfies Record<Outfit, PresetOption>

export const vibeSchema = z.enum([
  'heroic',
  'sinister',
  'melancholic',
  'cheerful',
  'stoic',
  'mischievous',
  'regal',
  'weary',
  'fierce',
  'serene',
  'unhinged',
  'mysterious',
])
export type Vibe = z.infer<typeof vibeSchema>

export const VIBES = {
  heroic: { id: 'heroic', label: 'Героический', fragment: 'heroic, confident expression' },
  sinister: { id: 'sinister', label: 'Зловещий', fragment: 'sinister, menacing expression' },
  melancholic: { id: 'melancholic', label: 'Меланхоличный', fragment: 'melancholic, sorrowful expression' },
  cheerful: { id: 'cheerful', label: 'Весёлый', fragment: 'cheerful, warm smile' },
  stoic: { id: 'stoic', label: 'Невозмутимый', fragment: 'stoic, unreadable expression' },
  mischievous: { id: 'mischievous', label: 'Хитрый', fragment: 'mischievous smirk' },
  regal: { id: 'regal', label: 'Царственный', fragment: 'regal, imperious bearing' },
  weary: { id: 'weary', label: 'Усталый', fragment: 'weary, hollow-eyed' },
  fierce: { id: 'fierce', label: 'Яростный', fragment: 'fierce, snarling intensity' },
  serene: { id: 'serene', label: 'Безмятежный', fragment: 'serene, peaceful expression' },
  unhinged: { id: 'unhinged', label: 'Безумный', fragment: 'unhinged, manic grin' },
  mysterious: { id: 'mysterious', label: 'Загадочный', fragment: 'mysterious, guarded expression' },
} satisfies Record<Vibe, PresetOption>

// ─────────────────────────────────────────────────────────────────────────────
// Traits — the MULTI-select axis, and the one the owner actually asked for:
// missing eye, iron arm, horns, scars. Grouped for the picker, flat for the
// composer.
// ─────────────────────────────────────────────────────────────────────────────

export const traitIdSchema = z.enum([
  // prosthetics & injury
  'missing-eye',
  'eyepatch',
  'iron-arm',
  'prosthetic-leg',
  'hook-hand',
  'wooden-limb',
  'robotic-jaw',
  'cybernetic-spine',
  'cyber-implants',
  'glowing-veins',
  // marks
  'facial-scar',
  'burn-scars',
  'tattoos',
  'warpaint',
  'freckles',
  'vitiligo',
  'heterochromia',
  'glowing-eyes',
  'bald',
  'beard',
  // fantasy anatomy
  'horns',
  'antlers',
  'wings',
  'tail',
  'pointed-ears',
  'fangs',
  'claws',
  'third-eye',
  'gills',
  'feathers',
  // worn
  'mask',
  'blindfold',
])
export type TraitId = z.infer<typeof traitIdSchema>

export const TRAITS = {
  'missing-eye': { id: 'missing-eye', label: 'Нет глаза', fragment: 'one eye missing, empty scarred socket' },
  eyepatch: { id: 'eyepatch', label: 'Повязка на глаз', fragment: 'leather eyepatch over one eye' },
  'iron-arm': { id: 'iron-arm', label: 'Железная рука', fragment: 'one arm replaced by a riveted iron prosthetic' },
  'prosthetic-leg': { id: 'prosthetic-leg', label: 'Протез ноги', fragment: 'one leg replaced by a mechanical prosthetic' },
  'hook-hand': { id: 'hook-hand', label: 'Крюк вместо руки', fragment: 'a hook in place of one hand' },
  'wooden-limb': { id: 'wooden-limb', label: 'Деревянный протез', fragment: 'a carved wooden prosthetic limb' },
  'robotic-jaw': { id: 'robotic-jaw', label: 'Механическая челюсть', fragment: 'lower jaw replaced by exposed machinery' },
  'cybernetic-spine': { id: 'cybernetic-spine', label: 'Кибер-позвоночник', fragment: 'a cybernetic spine with exposed vertebral ports' },
  'cyber-implants': { id: 'cyber-implants', label: 'Импланты', fragment: 'chrome cybernetic implants set into the temple and cheek' },
  'glowing-veins': { id: 'glowing-veins', label: 'Светящиеся вены', fragment: 'veins glowing faintly beneath the skin' },
  'facial-scar': { id: 'facial-scar', label: 'Шрам на лице', fragment: 'a long scar across the face' },
  'burn-scars': { id: 'burn-scars', label: 'Ожоги', fragment: 'burn scars across one side of the face and neck' },
  tattoos: { id: 'tattoos', label: 'Татуировки', fragment: 'intricate tattoos across the neck and hands' },
  warpaint: { id: 'warpaint', label: 'Боевая раскраска', fragment: 'bold tribal warpaint across the face' },
  freckles: { id: 'freckles', label: 'Веснушки', fragment: 'dense freckles across the nose and cheeks' },
  vitiligo: { id: 'vitiligo', label: 'Витилиго', fragment: 'vitiligo, patches of depigmented skin' },
  heterochromia: { id: 'heterochromia', label: 'Гетерохромия', fragment: 'heterochromia, each eye a different colour' },
  'glowing-eyes': { id: 'glowing-eyes', label: 'Светящиеся глаза', fragment: 'eyes glowing with inner light' },
  bald: { id: 'bald', label: 'Лысый', fragment: 'completely bald, no hair' },
  beard: { id: 'beard', label: 'Борода', fragment: 'a thick full beard' },
  horns: { id: 'horns', label: 'Рога', fragment: 'a pair of curved horns' },
  antlers: { id: 'antlers', label: 'Оленьи рога', fragment: 'branching antlers' },
  wings: { id: 'wings', label: 'Крылья', fragment: 'large wings folded at the back' },
  tail: { id: 'tail', label: 'Хвост', fragment: 'a long tail' },
  'pointed-ears': { id: 'pointed-ears', label: 'Острые уши', fragment: 'long pointed ears' },
  fangs: { id: 'fangs', label: 'Клыки', fragment: 'prominent fangs' },
  claws: { id: 'claws', label: 'Когти', fragment: 'sharp claws instead of fingernails' },
  'third-eye': { id: 'third-eye', label: 'Третий глаз', fragment: 'a third eye on the forehead' },
  gills: { id: 'gills', label: 'Жабры', fragment: 'gill slits along the neck' },
  feathers: { id: 'feathers', label: 'Перья', fragment: 'feathers growing along the arms and jaw' },
  mask: { id: 'mask', label: 'Маска', fragment: 'a mask covering the lower face' },
  blindfold: { id: 'blindfold', label: 'Повязка на глазах', fragment: 'a cloth blindfold over both eyes' },
} satisfies Record<TraitId, PresetOption>

// The picker's grouping. Data, not layout: the constructor renders one section
// per group, and a trait can only be in one (the flat TRAITS table stays the
// single source of the fragment).
export const TRAIT_GROUPS = [
  {
    id: 'prosthetics',
    label: 'Протезы и увечья',
    traits: [
      'missing-eye',
      'eyepatch',
      'iron-arm',
      'prosthetic-leg',
      'hook-hand',
      'wooden-limb',
      'robotic-jaw',
      'cybernetic-spine',
      'cyber-implants',
      'glowing-veins',
    ],
  },
  {
    id: 'marks',
    label: 'Отметины',
    traits: [
      'facial-scar',
      'burn-scars',
      'tattoos',
      'warpaint',
      'freckles',
      'vitiligo',
      'heterochromia',
      'glowing-eyes',
      'bald',
      'beard',
    ],
  },
  {
    id: 'anatomy',
    label: 'Нечеловеческое',
    traits: [
      'horns',
      'antlers',
      'wings',
      'tail',
      'pointed-ears',
      'fangs',
      'claws',
      'third-eye',
      'gills',
      'feathers',
    ],
  },
  { id: 'worn', label: 'Ношение', traits: ['mask', 'blindfold'] },
] satisfies ReadonlyArray<{ id: string; label: string; traits: readonly TraitId[] }>

// WHY SIX. Diffusion text encoders drop concepts past a handful: a 15-trait
// character silently renders as a 4-trait one, and the user blames us for the
// eleven they paid for and did not get. Refusing at the schema is the only
// honest place — the UI disables the 7th chip, and the API rejects a client
// that ignores the UI.
export const MAX_TRAITS = 6

// ─────────────────────────────────────────────────────────────────────────────
// The soul itself.
// ─────────────────────────────────────────────────────────────────────────────

export const soulSchema = z.object({
  archetype: archetypeSchema,
  // Shared with CinemaStudio (presets.ts). ONE style table on purpose: a
  // character built in `anime` and then animated in an `anime` film must agree,
  // and two enums would drift the moment one gains a value.
  styleId: styleIdSchema,
  age: ageSchema.optional(),
  build: buildSchema.optional(),
  hairColor: hairColorSchema.optional(),
  hairStyle: hairStyleSchema.optional(),
  eyeColor: eyeColorSchema.optional(),
  skin: skinSchema.optional(),
  outfit: outfitSchema.optional(),
  vibe: vibeSchema.optional(),
  traits: z.array(traitIdSchema).max(MAX_TRAITS).default([]),
  // The escape hatch. Appended LAST, verbatim: a constructor cannot round-trip
  // prose, so anything the tables cannot say lives here and nowhere else.
  notes: z.string().max(500).default(''),
})
export type Soul = z.infer<typeof soulSchema>

// ─────────────────────────────────────────────────────────────────────────────
// The portrait views that make up a reference sheet.
// ─────────────────────────────────────────────────────────────────────────────

export const portraitViewSchema = z.enum(['front', 'three-quarter', 'profile', 'full-body'])
export type PortraitView = z.infer<typeof portraitViewSchema>

// `aspect` lives HERE, not in the API, so the web can price and preview a view
// with the same number the server will submit. A full-body shot in a square
// frame wastes half the pixels on background, so it alone is portrait.
export type PortraitViewOption = PresetOption & { aspect: '1:1' | '9:16' }

export const PORTRAIT_VIEWS = {
  front: {
    id: 'front',
    label: 'Анфас',
    fragment: 'front view, facing the camera directly, head and shoulders',
    aspect: '1:1',
  },
  'three-quarter': {
    id: 'three-quarter',
    label: 'Три четверти',
    fragment: 'three-quarter view, head turned 45 degrees, head and shoulders',
    aspect: '1:1',
  },
  profile: {
    id: 'profile',
    label: 'Профиль',
    fragment: 'strict side profile view, head and shoulders',
    aspect: '1:1',
  },
  'full-body': {
    id: 'full-body',
    label: 'В полный рост',
    fragment: 'full body shot, standing straight, head to toe, entire figure visible',
    aspect: '9:16',
  },
} satisfies Record<PortraitView, PortraitViewOption>

// The sheet, in order. The FIRST entry is the hero shot — the one rendered with
// no reference, which every later view then references (see the model rule
// below). Reordering this array changes which face the sheet converges on.
export const PORTRAIT_SHEET_VIEWS = ['front', 'three-quarter', 'profile', 'full-body'] as const

// THE MODEL RULE (ADR §3), as data. `flux-kontext-pro` is the only catalogue
// entry that accepts referenceImages, so a consistent multi-view sheet is only
// possible by having the character reference ITSELF:
//   · no primary photo yet → SOUL_HERO_MODEL_ID, no refs   (cheap, 2 credits)
//   · primary photo exists → SOUL_SHEET_MODEL_ID + a self-reference (8 credits)
// The API enforces it; these ids are exported so the web can price the button
// from the same catalogue entries the server will charge against.
export const SOUL_HERO_MODEL_ID = 'flux-dev'
export const SOUL_SHEET_MODEL_ID = 'flux-kontext-pro'

// ─────────────────────────────────────────────────────────────────────────────
// The composer. Pure, total, and the single source of the text a soul becomes.
// ─────────────────────────────────────────────────────────────────────────────

// Hair reads as ONE concept or none. Colour is an adjective, style is a noun
// phrase, so "platinum blonde" + "long flowing hair" joins into a phrase a text
// encoder weights once — where "blonde hair, long hair" would weight twice and
// blur. Colour alone needs the noun supplied; style alone already has it.
function composeHair(soul: Soul): string {
  const color = soul.hairColor ? HAIR_COLORS[soul.hairColor].fragment : ''
  const style = soul.hairStyle ? HAIR_STYLES[soul.hairStyle].fragment : ''
  if (color && style) return `${color} ${style}`
  if (color) return `${color} hair`
  return style
}

// The subject text: what the character IS, with no style and no framing.
// Order is FIXED so the same clicks always produce the same string — the entity
// description is derived from this, and a description that reshuffles on every
// save is a description nobody can diff.
export function composeSoul(soul: Soul): string {
  const fragments: string[] = [ARCHETYPES[soul.archetype].fragment]

  if (soul.age) fragments.push(AGES[soul.age].fragment)
  if (soul.build) fragments.push(BUILDS[soul.build].fragment)
  if (soul.skin) fragments.push(SKINS[soul.skin].fragment)

  const hair = composeHair(soul)
  if (hair) fragments.push(hair)

  if (soul.eyeColor) fragments.push(EYE_COLORS[soul.eyeColor].fragment)

  // Traits before outfit: a missing eye is part of the person, a leather jacket
  // is on top of them. Capped at MAX_TRAITS by the schema; sliced here too so a
  // hand-built Soul object (a PROMPT_LIBRARY entry, a test) cannot exceed it
  // silently — the cap is a property of the composition, not of the parser.
  for (const traitId of soul.traits.slice(0, MAX_TRAITS)) {
    fragments.push(TRAITS[traitId].fragment)
  }

  if (soul.outfit) fragments.push(OUTFITS[soul.outfit].fragment)
  if (soul.vibe) fragments.push(VIBES[soul.vibe].fragment)

  const notes = soul.notes.trim()
  if (notes) fragments.push(notes)

  return fragments.join(', ')
}

// The prompt for ONE view of the reference sheet. The view fragment goes LAST
// so the framing is the most recent thing the encoder read, after it already
// knows who it is drawing.
export function composePortraitPrompt(soul: Soul, view: PortraitView): string {
  return `${composeSoul(soul)}, ${PORTRAIT_VIEWS[view].fragment}`
}

// The preset every soul render travels with: the character's style (which owns
// its own negative prompt) plus the reference-sheet framing (which owns the
// "clean and unambiguous" negative — no busy background, one subject, no text).
// Returning it as a PromptPreset — rather than composing the fragments here —
// is what keeps the negatives alive; see this file's header.
export function soulPromptPreset(soul: Soul): { styleId: Soul['styleId']; framing: 'reference-sheet' } {
  return { styleId: soul.styleId, framing: 'reference-sheet' }
}

// ─────────────────────────────────────────────────────────────────────────────
// The ready-made library the owner asked for. Each entry is a Soul LITERAL, not
// a string: the UI shows its composed prompt with a Copy button *and* can open
// it in the constructor — we ship copyable text without paying for it in lost
// structure.
// ─────────────────────────────────────────────────────────────────────────────
export type PromptLibraryEntry = { id: string; label: string; soul: Soul }

export const PROMPT_LIBRARY: readonly PromptLibraryEntry[] = [
  {
    id: 'iron-captain',
    label: 'Железный капитан',
    soul: {
      archetype: 'male',
      styleId: 'disney',
      age: 'middle-aged',
      build: 'muscular',
      hairColor: 'silver',
      hairStyle: 'short',
      eyeColor: 'grey',
      skin: 'weathered',
      outfit: 'military',
      vibe: 'stoic',
      traits: ['iron-arm', 'facial-scar', 'beard'],
      notes: '',
    },
  },
  {
    id: 'neon-runner',
    label: 'Неоновая беглянка',
    soul: {
      archetype: 'female',
      styleId: 'anime',
      age: 'young-adult',
      build: 'slim',
      hairColor: 'pink',
      hairStyle: 'messy',
      eyeColor: 'amber',
      skin: 'pale',
      outfit: 'cyberpunk',
      vibe: 'mischievous',
      traits: ['cyber-implants', 'heterochromia', 'tattoos'],
      notes: '',
    },
  },
  {
    id: 'forest-elder',
    label: 'Лесной старец',
    soul: {
      archetype: 'creature',
      styleId: 'hand-drawn',
      age: 'old',
      build: 'towering',
      hairColor: 'white',
      hairStyle: 'long',
      eyeColor: 'gold',
      skin: 'stone',
      outfit: 'robe',
      vibe: 'serene',
      traits: ['antlers', 'glowing-veins', 'pointed-ears'],
      notes: '',
    },
  },
  {
    id: 'scrapyard-kid',
    label: 'Пацан со свалки',
    soul: {
      archetype: 'child',
      styleId: '3d-cartoon',
      build: 'petite',
      hairColor: 'brown',
      hairStyle: 'curly',
      eyeColor: 'green',
      skin: 'tan',
      outfit: 'post-apocalyptic',
      vibe: 'cheerful',
      traits: ['freckles', 'prosthetic-leg'],
      notes: '',
    },
  },
  {
    id: 'comic-villain',
    label: 'Злодей из комикса',
    soul: {
      archetype: 'male',
      styleId: 'comic',
      age: 'adult',
      build: 'hulking',
      eyeColor: 'red',
      skin: 'metallic',
      outfit: 'armor',
      vibe: 'sinister',
      traits: ['robotic-jaw', 'glowing-eyes', 'burn-scars'],
      notes: '',
    },
  },
  {
    id: 'silent-monk',
    label: 'Молчаливый монах',
    soul: {
      archetype: 'androgynous',
      styleId: 'cinematic',
      age: 'ageless',
      build: 'athletic',
      skin: 'olive',
      outfit: 'kimono',
      vibe: 'stoic',
      traits: ['bald', 'blindfold', 'third-eye'],
      notes: '',
    },
  },
  {
    id: 'ash-fox',
    label: 'Пепельный лис',
    soul: {
      archetype: 'anthro',
      styleId: '2d-cartoon',
      age: 'young-adult',
      build: 'slim',
      eyeColor: 'violet',
      skin: 'furred',
      outfit: 'leather-jacket',
      vibe: 'mischievous',
      traits: ['tail', 'pointed-ears', 'fangs'],
      notes: '',
    },
  },
  {
    id: 'deep-diver',
    label: 'Глубинный ныряльщик',
    soul: {
      archetype: 'creature',
      styleId: 'cinematic',
      age: 'adult',
      build: 'athletic',
      eyeColor: 'black',
      skin: 'scaled',
      outfit: 'rags',
      vibe: 'weary',
      traits: ['gills', 'claws', 'vitiligo'],
      notes: '',
    },
  },
]
