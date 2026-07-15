// apps/api/src/modules/templates/catalog/buran.ts
// «Буран» — the hand-drawn animated short. The first template on the 'animation'
// shelf, and a deliberately different animal from the brainrot dramas.
//
// WHERE IT CAME FROM: a single ~10 000-character Higgsfield prompt that produced
// one scene — a mother carrying an infant up a snow slope through a blizzard,
// a toddler stumbling behind her, four hard cuts, two lines of Kazakh. This file
// is that prompt, disassembled into the three places the system can actually
// reproduce it from, because a 10k blob is not a template and cannot be one:
//
//   1. THE LOOK  → STYLE_PRESETS['hand-drawn'] in contracts/presets.ts.
//      Drawing technique only — on twos, oil-brush, line boil, no interpolation —
//      so it is reusable on ANY shot in CinemaStudio, not just this story.
//   2. THE CAMERA → the preset axes (cameraShot + cameraMotion: 'handheld').
//      Structured, not prose, so the picker can show it and the user can change it.
//   3. THE DIRECTION → the per-shot prompts below: staging, blocking, the acting,
//      the storm, the dialogue.
//
// THE 2000-CHARACTER WALL is the constraint that shaped everything here.
// shot.prompt is capped at 2000 chars (contracts/film.ts, asserted in
// templates.test.ts), and the source prompt is five times that. It does not
// compress by deleting direction — the direction IS the product; a "hand-drawn
// mother in a blizzard" prompt without it renders a smooth 3D-looking woman
// standing calmly in light snow. It compresses by HOISTING: everything true of
// every frame moved into DIRECTION (below, ~800 chars, pasted into all four
// shots), everything true of every hand-drawn film moved into the style preset,
// leaving each shot to carry only what makes it that shot. Four beats now fit.
//
// WHY THE DIALOGUE IS IN THE PROMPT AND NOT IN `voiceover`.
// It is the one thing about this template a reader will want explained. Every
// other template puts spoken lines in shot.voiceover — a separate TTS track. Two
// reasons that is wrong here, and they compound:
//   · The TTS catalog offers six voices, all Russian or English (catalog.ts:
//     Svetlana, Elena, Dmitry, Nikolai, Ashley, Alex). Kazakh read by a Russian
//     voice is precisely the failure the source prompt spends a paragraph
//     forbidding ("Kazakh with native pronunciation, not Russian-accented").
//   · The performance is not a voice-over — the lips form the syllables ON TWOS,
//     on camera. That is a VIDEO instruction. It only exists if the model that
//     draws the mouth is also the model that speaks.
// So the lines live inside the prompt, and only the premium tier (Veo, native
// audio) actually voices them. Draft and standard render the same performance
// silent — the mouth still moves, the acting is still shaped by the line. That is
// an honest degradation, and tierNotes says so out loud on the card.
// Consequence: hasVoiceover is false for this template. Correct — it ships no
// TTS track, and claiming otherwise on the gallery card would be a lie.
//
// NO musicPrompt, on purpose. The source ends with "No music. No subtitles." —
// the storm is the score. Leaving the field unset means the film editor's audio
// panel does not pre-fill a music bed, which is the template having an opinion,
// not the template forgetting to have one.
import type { Template } from '../types'

// The director's notes — the ~800 characters that are true of EVERY frame of this
// film and therefore have to be pasted into every shot, because each shot is
// generated as an independent request that shares no context with its neighbours.
//
// Every clause here is load-bearing and was earned by a failure mode:
//   · "COLD ACTED BY THE BODY, never labelled" — models render "a cold woman" as
//     a calm woman in a coat. Cold only exists on screen as behaviour: staggering,
//     ducking, flinching. So the behaviour is what we ask for.
//   · "blinks as HELD CLOSED-EYE FRAMES" — a blink drawn on twos is two frames of
//     a shut eye, not a smooth eyelid sweep. Naming it keeps the cadence honest
//     in the faces, which is where the eye actually checks whether it is hand-drawn.
//   · "rolling waves of white-out" — the storm has to keep moving through the
//     frame during dialogue too, or the model quietly calms it down to talk.
const DIRECTION =
  'BURAN NEVER PAUSES: violent blizzard every frame, gusts driving snow horizontally, rolling waves of white-out swallowing the figures then revealing them, cloth whipped sideways. COLD ACTED BY THE BODY, never labelled: staggering under gusts, faces turned from the snow, heads ducked, shuddering, cracked lips, snow on lashes. MICRO-ACTING: blinks as held closed-eye frames on twos, hard squints, jaw clenched. CAMERA: aggressively handheld, jerky bounce every step, frame shoved sideways by gusts, horizon never level. LIGHT: night, no light source, flat dim grey ambient, flat painted shadow. THE BUNDLE never glows. The child never cries.'

// The voice direction, added only to the two shots that actually have a line.
// Gender-neutral on purpose: THE ADULT is a knob, and "a young woman around 25"
// baked in here would contradict the father and grandmother options.
const VOICE =
  'VOICE: low, hushed, breathy, strained by cold but disciplined for the child, each phrase pushed against the wind on a tense exhale, broken between shivering inhales. Kazakh, native pronunciation, never Russian-accented, acted not flat. Lips form each syllable on twos.'

export const buran: Template = {
  id: 'buran',
  category: 'animation',
  name: 'Буран',
  tagline: 'Она ведёт детей вверх по склону сквозь буран. Четыре кадра, ни одной паузы.',
  description:
    'Рисованная короткометражка — не мультик, а анимационное кино: каждый кадр нарисован на двойках (12 рисунков ' +
    'в секунду), масляная кисть перерисовывается от кадра к кадру, линия «кипит». Одна сцена, четыре жёстких склейки: ' +
    'восхождение, окрик, мольба, падение и объятие. Холод здесь не назван, а сыгран — телом, в каждом кадре. ' +
    'Реплики звучат по-казахски, и на премиум-тарифе модель произносит их сама, попадая в губы.',
  aspectRatio: '16:9',
  defaultStyleId: 'hand-drawn',
  titleTemplate: 'Буран: {{name}}',

  // Every clip is 8 seconds, and all three models render 8s at 16:9 natively —
  // the invariant templates.test.ts checks. Veo is the only one of the three that
  // speaks, which is the entire argument for the premium tier on this template.
  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    standard: 'Немое кино — губы двигаются, реплики не звучат',
    premium: 'Модель сама произносит казахские реплики и попадает в губы',
  },

  // Three knobs, and everything else is fixed — the storm, the slope, the four
  // beats, the lines. Same reasoning as cat-drama: the format IS the arc, and a
  // knob that lets the user break it is not a feature. What varies is WHO is
  // climbing, and the one word the film says out loud.
  variables: [
    {
      key: 'adult',
      kind: 'select',
      label: 'Кто ведёт',
      hint: 'Несёт младенца на руках. Канон формата — мать.',
      defaultValue: 'mother',
      // Each option defines the THE ADULT tag that the shot prompts refer to. The
      // tag indirection is what lets the shots stay pronoun-free — "her robe"
      // would silently misgender the father and grandmother options.
      //
      // The bundle's "never glows, emits no light" is not decoration: given a dark
      // wrapped shape held to a chest at night, models reliably invent a warm glow
      // from it. There is no light source in this film, and a glowing baby would
      // wreck the one rule the lighting has.
      options: [
        {
          value: 'mother',
          label: 'Мать',
          spoken: 'мать',
          prompt:
            'THE ADULT = THE MOTHER, a young Central Asian woman around 25 in a heavy dark wool robe and thick head wrap, carrying a tightly wrapped infant bundle in one arm against her chest, the baby sealed in dark cloth, face hidden.',
        },
        {
          value: 'father',
          label: 'Отец',
          spoken: 'отец',
          prompt:
            'THE ADULT = THE FATHER, a Central Asian man around 30 in a heavy sheepskin coat and fur hat, carrying a tightly wrapped infant bundle in one arm against his chest, the baby sealed in dark cloth, face hidden.',
        },
        {
          value: 'grandmother',
          label: 'Бабушка',
          spoken: 'бабушка',
          prompt:
            'THE ADULT = THE GRANDMOTHER, an old Central Asian woman with a deep-lined face, in a heavy quilted robe and white head wrap, carrying a tightly wrapped infant bundle in one arm against her chest, the baby sealed in dark cloth, face hidden.',
        },
      ],
    },
    {
      key: 'child',
      kind: 'select',
      label: 'Кто идёт следом',
      hint: 'Малыш, который цепляется за подол и отстаёт.',
      defaultValue: 'girl',
      options: [
        {
          value: 'girl',
          label: 'Девочка',
          spoken: 'девочка',
          prompt:
            'THE CHILD = a small toddler girl, round Central Asian face, a thick dark braid escaping a fur-lined cap, in a quilted coat far too big for her, stiff mittens.',
        },
        {
          value: 'boy',
          label: 'Мальчик',
          spoken: 'мальчик',
          prompt:
            'THE CHILD = a small toddler boy, round Central Asian face, close-cropped dark hair under a fur-lined cap, in a quilted coat far too big for him, stiff mittens.',
        },
      ],
    },
    {
      // The only knob whose value is HEARD. It lands inside a quoted Kazakh line
      // ("{{name}}... артта қалма") so its `prompt` is the latin transliteration
      // the model must pronounce, while `spoken` is the Cyrillic form that names
      // the film. A select rather than free text precisely because it reaches a
      // visual prompt — a closed set is the only kind of value allowed to.
      key: 'name',
      kind: 'select',
      label: 'Имя ребёнка',
      hint: 'Его выкрикивают в кадре 2 — оно звучит вслух.',
      defaultValue: 'umai',
      options: [
        { value: 'umai', label: 'Умай', spoken: 'Умай', prompt: 'Umai' },
        { value: 'aisha', label: 'Айша', spoken: 'Айша', prompt: 'Aisha' },
        { value: 'aruzhan', label: 'Аружан', spoken: 'Аружан', prompt: 'Aruzhan' },
        { value: 'batyr', label: 'Батыр', spoken: 'Батыр', prompt: 'Batyr' },
      ],
    },
  ],

  // Four shots, hard cuts between them — no transition field anywhere, because
  // 'none' IS the hard cut and the source names it as a constraint ("four distinct
  // shots with hard cuts, not one continuous take"). A crossfade here would read
  // as a dissolve through time and dissolve the urgency with it.
  //
  // The shot sizes descend — wide, medium-wide, tight-medium, medium — pulling the
  // viewer from the scale of the slope down onto a face and then back out to the
  // fall. Framing is off-centre throughout with the empty white slope as active
  // negative space: the figures are small, low, and losing.
  shots: [
    {
      kind: 'clip',
      beat: 'Восхождение',
      durationSeconds: 8,
      prompt:
        'CHARACTERS: {{adult}} {{child}} ' +
        'SHOT — WIDE ESTABLISHING, camera low on the slope BELOW them, looking up the incline at their backs. THE ADULT, bent over the bundle, leads the climb; THE CHILD is below and behind, gripping the hem of the robe, sinking knee-deep, dragging back so THE ADULT glances down and braces. Both figures small, LOW and to the LEFT third as one dark mass; the rest of the frame is empty white-out slope rising up and right — dominant negative space, the unknown they climb toward. Dark pine trunks at the right edge. A wave of buran swallows them; they re-emerge, still climbing. No dialogue. ' +
        DIRECTION,
      preset: {
        styleId: 'hand-drawn',
        cameraShot: 'wide',
        cameraMotion: 'handheld',
        quality: 'ultra',
      },
    },
    {
      kind: 'clip',
      beat: 'Не отставай',
      durationSeconds: 8,
      prompt:
        'CHARACTERS: {{adult}} {{child}} ' +
        'SHOT — MEDIUM WIDE at eye level, alongside THE ADULT. THE ADULT in the RIGHT third, leaning up-left into the rise, face in profile; THE CHILD lower and LEFT-CENTRE in soft focus, joined only by a small fist gripping the robe near frame centre — the one link holding the mass together. Empty white slope fills the upper left. THE CHILD staggers under a gust and ducks her head. Feeling the tug, THE ADULT turns back, hauls her up by the forearm, brushes snow off her cap, faces the rise again — then turns partway, profile clear between waves of snow, and speaks on a tense exhale: "{{name}}... артта қалма." Buran half-swallows the figure, then it clears: "Аз-ақ қалды." ' +
        VOICE +
        ' ' +
        DIRECTION,
      preset: {
        styleId: 'hand-drawn',
        cameraShot: 'medium',
        cameraMotion: 'handheld',
        quality: 'ultra',
      },
    },
    {
      kind: 'clip',
      beat: 'Шыда, балапаным',
      durationSeconds: 8,
      prompt:
        'CHARACTERS: {{adult}} {{child}} ' +
        'SHOT — TIGHT MEDIUM three-quarter on THE ADULT, slightly low angle. The face sits UPPER-RIGHT, looking down and back over the shoulder toward the LOWER LEFT where THE CHILD scrambles up in deep soft focus, head ducked. The bundle is a dark shape low at the chest. The downward diagonal of the gaze binds adult, bundle and child into one line. The rising slope tilts the frame. Snow on the cheek, raw wind-burned skin. Half to the baby, half to the child below, quieter now: "Шыда, балапаным." Dense buran swallows the face into white; it emerges, jaw trembling, the voice almost cracking: "Тоқтама." A snowflake catches on the lashes and the eyelid flutters. ' +
        VOICE +
        ' ' +
        DIRECTION,
      preset: {
        styleId: 'hand-drawn',
        cameraShot: 'close-up',
        cameraMotion: 'handheld',
        quality: 'ultra',
      },
    },
    {
      kind: 'clip',
      beat: 'Падение и объятие',
      durationSeconds: 8,
      // The one shot that breaks the film's own camera rule, and the reason it is
      // written down here: everywhere else the lens is at eye level or below, so
      // the figures stay upright against the slope. Here it settles to a modest
      // HIGH angle for the huddle — the only downward look in the film, and it is
      // what makes them small. The storm has finally brought them low; the camera
      // agrees with it for four seconds. Then the embrace re-merges the dark mass
      // the fall just broke.
      prompt:
        'CHARACTERS: {{adult}} {{child}} ' +
        'SHOT — MEDIUM, the fall and the embrace. THE CHILD\'s foot catches a buried drift and she pitches forward, face-down into the LOWER LEFT — the dark two-figure mass breaks apart, her grip torn from the robe. THE ADULT, in the RIGHT of frame, feels the robe pull free, stops dead, turns, comes back DOWN a step. The camera settles to a slightly HIGH angle looking down as THE ADULT lowers beside the child, pressing them small and vulnerable into the white snow, gathers THE CHILD up with the free arm, the bundle still clamped to the chest, and curls over her — the two re-merge into one dark huddled rounded shape, lower centre, surrounded by empty white. Snow brushed from the child\'s face, forehead pressed to her cap. They have stopped. The wind howls over the still huddle and the camera keeps shaking in the gusts though the figures now hold still. The eyes close for a held beat of exhaustion. No dialogue. ' +
        DIRECTION,
      preset: {
        styleId: 'hand-drawn',
        cameraShot: 'medium',
        cameraMotion: 'handheld',
        quality: 'ultra',
      },
    },
  ],
}
