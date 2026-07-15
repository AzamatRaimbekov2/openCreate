// apps/web/src/modules/Soul/model/soulPresentation.test.ts
// The two ways a soul is shown: to the MODEL (the composed prompt the server
// will submit) and to the HUMAN (a readable list of picked options). Both are
// pure, so both are provable here.
import type { Soul } from '@opencreate/contracts'
import { composeSoulPreview, soulFacts, soulTraitLabels } from './soulPresentation'

function makeSoul(overrides: Partial<Soul> = {}): Soul {
  return {
    archetype: 'female',
    styleId: 'anime',
    traits: [],
    notes: '',
    ...overrides,
  }
}

describe('composeSoulPreview', () => {
  it('shows the prompt the SERVER will submit for the hero shot — subject, style and framing', () => {
    const { positivePrompt } = composeSoulPreview(makeSoul({ traits: ['iron-arm'] }))
    // the subject (composeSoul) …
    expect(positivePrompt).toContain('a woman')
    expect(positivePrompt).toContain('riveted iron prosthetic')
    // … the style preset (applyPromptPreset) …
    expect(positivePrompt).toContain('anime style')
    // … and the reference-sheet framing that makes the shot readable
    expect(positivePrompt).toContain('character reference sheet')
    expect(positivePrompt).toContain('front view')
  })

  it('keeps BOTH negatives — the one from the style and the one from the framing', () => {
    const { negativePrompt } = composeSoulPreview(makeSoul())
    expect(negativePrompt).toContain('photorealistic')
    expect(negativePrompt).toContain('multiple characters')
  })

  it('changes when a picker changes (the live preview is a function of the draft)', () => {
    const before = composeSoulPreview(makeSoul()).positivePrompt
    const after = composeSoulPreview(makeSoul({ hairColor: 'pink' })).positivePrompt
    expect(after).not.toBe(before)
    expect(after).toContain('candy pink hair')
  })
})

describe('soulFacts', () => {
  it('lists only the axes the user actually picked, in a stable order', () => {
    const facts = soulFacts(makeSoul({ age: 'old', outfit: 'robe' }))
    expect(facts.map((fact) => fact.axis)).toEqual(['archetype', 'style', 'age', 'outfit'])
  })

  it('renders the picked option LABEL, never the model-facing fragment', () => {
    const facts = soulFacts(makeSoul({ archetype: 'creature', styleId: 'comic' }))
    expect(facts).toContainEqual({ axis: 'archetype', value: 'Существо' })
    expect(facts).toContainEqual({ axis: 'style', value: 'Комикс' })
    expect(facts.map((fact) => fact.value)).not.toContain('a fantasy creature, humanoid')
  })
})

describe('soulTraitLabels', () => {
  it('maps trait ids to their human labels', () => {
    expect(soulTraitLabels(makeSoul({ traits: ['horns', 'missing-eye'] }))).toEqual([
      'Рога',
      'Нет глаза',
    ])
  })

  it('never shows more traits than the composer will actually use', () => {
    // A hand-built soul (a library entry, a legacy row) could exceed the cap;
    // composeSoul slices at MAX_TRAITS, so the readable list must agree or the
    // card would promise traits the picture never had.
    const overloaded = makeSoul({
      traits: ['horns', 'tail', 'fangs', 'claws', 'wings', 'antlers', 'gills'],
    })
    expect(soulTraitLabels(overloaded)).toHaveLength(6)
  })
})
