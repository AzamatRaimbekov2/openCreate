// apps/api/src/modules/templates/catalog/brick-space.ts
// «Космическая миссия» — the brickfilm space rescue. Second of the «Брик-мульты»
// shelf (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition (Hassing
// 1973 → «The Magic Portal» 1989 → the brickfilms.com community from 2000) and
// for the three prompt instructions that make the look work — stepped stop-motion
// with no motion blur, a rigid printed face that never acts, and tilt-shift macro
// to fake the scale. All three apply here unchanged.
//
// WHY SPACE IS THE SECOND STORY: it is the oldest subject in the medium. The very
// first brickfilm was a moon voyage, and the toy's own space sets are what most
// people's brick worlds were built out of. It also gives the shelf its one genuine
// SPECTACLE story — everything else on the shelf is people in rooms.
//
// THE ONE PRACTICAL EFFECT WORTH NAMING IN THE PROMPTS: cotton wool. Brickfilmers
// have used pulled-apart cotton wool for rocket exhaust, smoke and explosions
// since the Super 8 days, because it holds still between frames and real smoke
// does not. Asking for "cotton wool smoke" instead of "smoke" is the difference
// between a table-top brickfilm and a CGI rocket — a video model given "smoke"
// renders volumetric fluid simulation, which instantly breaks the illusion that
// somebody photographed this.
//
// THE ARC — launch → orbit → disaster → spacewalk → return — is the Apollo-13
// shape, and it is the shape because the disaster has to happen where nobody can
// help: the repair beat only means something if the character is alone outside the
// ship. Six paid beats plus one free card.
//
// ASPECT 16:9: this story is landscape by nature — a launch tower, a planet
// through a window, a figure on a tether against black. Cramming a spacescape into
// a phone frame throws away the only reason to animate it. (All three tier models
// do 8s at 16:9 as well as at 9:16, so the choice costs nothing; the boot
// assertion checks it.)
//
// GRAMMAR: `hero` options are all MASCULINE nominative and `destination` options
// are all FEMININE nominative — deliberately, because beat 3's line is «Вот она.
// {{destination}}. Мы первые.» and beat 5's is «{{hero}} вышел один». Adding a
// masculine destination («Марс», «Астероид») silently breaks «она». Adding a
// feminine hero breaks «вышел». See fruit-drama.ts for why this convention is how
// the templates avoid needing a grammar engine.
import type { Template } from '../types'

export const brickSpace: Template = {
  id: 'brick-space',
  category: 'brick',
  name: 'Космическая миссия',
  tagline: 'Метеорит пробил обшивку. Помощи ждать три года.',
  description:
    'Кирпичный мультфильм про космос: ракета из деталей конструктора, минифигурки в шлемах, авария на орбите ' +
    'и выход в открытый космос, чтобы залатать корпус. Семь битов — отсчёт, старт на ватном дыму, орбита, ' +
    'пробоина, ремонт на тросе, возвращение. Широкий кадр 16:9, покадровая анимация, реплики на русском. ' +
    'Шесть платных кадров: выбери командира, цель полёта и позывной корабля.',
  aspectRatio: '16:9',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Миссия «{{callsign}}»',

  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Минифигурки говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'sweeping orchestral space adventure, heroic brass fanfare at the launch, weightless shimmering strings in orbit, alarm-clock percussion and dissonant low brass during the breach, triumphant choir and full orchestra on the return',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто командир',
      hint: 'Тот, кто выйдет в открытый космос.',
      defaultValue: 'commander',
      options: [
        {
          value: 'commander',
          label: 'Командир корабля',
          prompt:
            'a minifigure commander in a white brick-built spacesuit with a printed grey moustache and steady printed eyes on his cylindrical head, transparent domed helmet, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'engineer',
          label: 'Бортинженер',
          prompt:
            'a minifigure flight engineer in an orange brick-built spacesuit with printed goggles and a printed frown on his cylindrical head, transparent domed helmet, a plastic wrench in his C-shaped claw hand, rigid unmoving printed face',
        },
        {
          value: 'rookie',
          label: 'Стажёр',
          prompt:
            'a young minifigure trainee astronaut in an oversized white brick-built spacesuit with wide printed eyes and printed freckles on his cylindrical head, transparent domed helmet, C-shaped claw hands, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'destination',
      kind: 'select',
      label: 'Куда летим',
      hint: 'Женский род — так требует реплика на орбите.',
      defaultValue: 'redplanet',
      options: [
        {
          value: 'redplanet',
          label: 'Красная планета',
          prompt: 'a huge rust-red planet built from red and orange bricks, dusty terminator line',
        },
        {
          value: 'moon',
          label: 'Луна',
          prompt: 'a pale grey cratered moon built from light-grey bricks and studded plates',
        },
        {
          value: 'ringed',
          label: 'Кольцевая планета',
          prompt:
            'an enormous pale-yellow gas planet built from tan bricks with a flat ring of loose grey plates around it',
        },
      ],
    },
    {
      // The single free-text knob, and it never touches a visual prompt: it names
      // the film (titleTemplate) and is spoken once by mission control. A ship name
      // is the one thing a user genuinely wants to author here.
      key: 'callsign',
      kind: 'text',
      label: 'Позывной корабля',
      hint: 'Идёт в название фильма и звучит из ЦУПа.',
      defaultValue: 'КИРПИЧ-1',
      maxLength: 40,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Отсчёт',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a tall brick-built rocket stands clamped in its launch tower at dawn, rows of tiny minifigure technicians at brick-built consoles in the foreground, floodlights raking the fuselage, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'crane', quality: 'ultra' },
      title: { text: 'До старта — десять секунд...', position: 'top' },
      voiceover: { text: '«{{callsign}}», это Земля. Готовность десять секунд.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Старт',
      durationSeconds: 8,
      // Cotton wool, not smoke — see the header. "Smoke" makes the model render a
      // fluid simulation and the table-top illusion dies on the first frame.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the brick-built rocket lifts off in a billowing cloud of pulled-apart cotton wool smoke, orange cellophane flame under the engines, the launch tower shaking apart into loose bricks, {{hero}} pressed back in his seat inside the capsule, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'crane', quality: 'ultra' },
      voiceover: { text: 'Поехали! Держитесь, парни, нас трясёт!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Орбита',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} floats weightless inside a cramped brick-built capsule, looking out of a round transparent window at {{destination}} filling the black sky, loose bricks and a plastic pen drifting past his helmet, cold blue light on the plastic, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      // The feminine-nominative line the grammar note exists for.
      voiceover: { text: 'Вот она. {{destination}}. Мы первые, кто её увидел.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Пробоина',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a small grey meteorite punches through the capsule wall and a section of the hull bursts apart into loose individual bricks that spin away into the dark, red warning lights strobing on {{hero}} inside, papers and plastic cups sucked toward the hole, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Пробоина в третьем отсеке! Мы теряем воздух!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Выход в космос',
      durationSeconds: 8,
      // The centre of the story: the repair only means anything because he is alone
      // outside the ship. That is why the disaster had to happen in orbit.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} hangs alone on a thin tether against absolute black, tiny against the brick-built ship, pressing a fresh brick plate over the torn hull with one C-shaped claw hand and a plastic wrench in the other, harsh unfiltered sunlight on one side of him and pitch dark on the other, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'orbit', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: '{{hero}} вышел один. Без страховки. Одна деталь — и домой.', voice: 'Svetlana' },
    },
    {
      kind: 'clip',
      beat: 'Возвращение',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a scorched brick-built capsule drifts down under a fabric parachute and thumps into a studded green brick field, the hatch pops off and {{hero}} climbs out to a crowd of cheering minifigures waving flags, golden hour light, lens flare, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Земля... я дома. Я правда дома.', voice: 'Nikolai' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'СЛЕДУЮЩАЯ МИССИЯ · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
