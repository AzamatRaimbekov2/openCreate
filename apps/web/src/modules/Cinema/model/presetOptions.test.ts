// apps/web/src/modules/Cinema/model/presetOptions.test.ts
// The style picker's source of truth after the registry migration (ADR
// style-studio D5). Load-bearing assertions:
//   * a BUILTIN is still spelled by the SPA's i18n, never by the server's row —
//     those labels are hardcoded Russian and rendering them is exactly what once
//     left the pickers reading «Аниме» in an English app;
//   * a USER style is spelled by its own name, verbatim and untranslated;
//   * a builtin the SPA has no copy for degrades to the server's name, never to
//     a raw i18n key on screen;
//   * an unloaded registry still offers the seven builtins — the picker is never
//     empty, because that table ships in the bundle.
import type { Style } from '@opencreate/contracts'
import {
  draftToPreset,
  presetToDraft,
  resolveStyleFragments,
  styleOptions,
} from './presetOptions'

// A translate double carrying only the keys the SPA actually ships, so a missing
// key behaves here exactly as it does in the app.
const COPY: Record<string, string> = {
  'cinema.preset.style.anime': 'Anime',
  'cinema.preset.style.cinematic': 'Cinematic',
}
const t = (key: string, options?: { defaultValue: string }) =>
  COPY[key] ?? options?.defaultValue ?? key

function style(overrides: Partial<Style> & Pick<Style, 'id'>): Style {
  return {
    name: 'Untitled',
    kind: 'prompt',
    builtin: false,
    fragment: '',
    negative: '',
    recommendedModelId: null,
    previewUrl: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe('styleOptions', () => {
  it('spells a builtin with the SPA copy, not the server row', () => {
    const options = styleOptions([style({ id: 'anime', name: 'Аниме', builtin: true })], t)

    expect(options).toEqual([{ value: 'anime', label: 'Anime' }])
  })

  it('spells a user style with its own name, untranslated', () => {
    const options = styleOptions([style({ id: 'uuid-1', name: 'Неоновый нуар' })], t)

    expect(options).toEqual([{ value: 'uuid-1', label: 'Неоновый нуар' }])
  })

  it('falls back to the server name for a builtin the SPA has no copy for', () => {
    const options = styleOptions([style({ id: 'newcomer', name: 'Ретро', builtin: true })], t)

    expect(options[0]?.label).toBe('Ретро')
  })

  it('offers the bundled builtins while the registry has not landed', () => {
    const options = styleOptions([], t)

    // The seven builtins ship in the bundle, so there is no honest reason to
    // show an empty picker — an empty list can only mean "not loaded yet"
    expect(options).toHaveLength(7)
    expect(options.map((option) => option.value)).toContain('anime')
    expect(options.find((option) => option.value === 'anime')?.label).toBe('Anime')
  })

  it('keeps the registry order — builtins first, then the styles I wrote', () => {
    const options = styleOptions(
      [
        style({ id: 'anime', name: 'Аниме', builtin: true }),
        style({ id: 'uuid-1', name: 'Neon noir' }),
      ],
      t,
    )

    expect(options.map((option) => option.value)).toEqual(['anime', 'uuid-1'])
  })
})

describe('a user style survives the draft ↔ wire round trip', () => {
  // The regression that matters after opening styleId: the inspector's save and
  // generate both go through these two functions, and a uuid must travel exactly
  // as one of the seven builtin ids always did.
  it('carries an arbitrary style id out to the wire and back', () => {
    const draft = presetToDraft({ styleId: 'b7c1f0e2-9a5d-4c3b-8e11-2f6a0d4c9b7e' })

    expect(draft.styleId).toBe('b7c1f0e2-9a5d-4c3b-8e11-2f6a0d4c9b7e')
    expect(draftToPreset(draft)).toEqual({ styleId: 'b7c1f0e2-9a5d-4c3b-8e11-2f6a0d4c9b7e' })
  })

  it('still drops the no-style sentinel instead of sending an empty id', () => {
    expect(draftToPreset(presetToDraft(null))).toEqual({})
  })
})

describe('resolveStyleFragments', () => {
  it('reads a user style out of the registry', () => {
    const mine = style({ id: 'uuid-1', fragment: 'neon noir', negative: 'daylight' })

    expect(resolveStyleFragments([mine], 'uuid-1')).toEqual({
      fragment: 'neon noir',
      negative: 'daylight',
    })
  })

  it('still resolves a builtin before the registry lands', () => {
    // The bundled table is the client half of the registry — a builtin never
    // has to wait for a request to compose correctly
    expect(resolveStyleFragments([], 'anime')?.fragment).toBeTruthy()
  })

  it('under-reports a user style rather than mis-reporting it', () => {
    // Not in the bundle and not in the (unloaded) registry: the honest answer is
    // "no fragments known here", so the composed preview omits them. The SERVER
    // still applies them — the preview is allowed to be incomplete, never wrong.
    expect(resolveStyleFragments([], 'uuid-1')).toBeUndefined()
  })
})
