// Prompt composition from structured mentions. This is the correctness core of
// the entity feature: if substitution is wrong, the user pays credits and gets a
// stranger — silently. Every test here is a way that could happen.
import { describe, expect, it } from 'vitest'
import { composePrompt } from './mentions'

const anya = { id: 'ent_1', name: 'Аня', description: 'женщина, тёмные волосы' }
const rex = { id: 'ent_2', name: 'Rex', description: 'german shepherd' }

describe('composePrompt', () => {
  it('substitutes a placeholder with the entity name and description', () => {
    const out = composePrompt('[[e1]] стоит у окна', [{ placeholder: 'e1', entityId: 'ent_1' }], {
      ent_1: anya,
    })
    expect(out).toBe('Аня (женщина, тёмные волосы) стоит у окна')
  })

  it('omits the parenthetical when the entity has no description', () => {
    const out = composePrompt('[[e1]] стоит', [{ placeholder: 'e1', entityId: 'ent_1' }], {
      ent_1: { ...anya, description: '   ' },
    })
    expect(out).toBe('Аня стоит')
  })

  it('substitutes EVERY occurrence of the same placeholder', () => {
    // "[[e1]] looks at [[e1]]'s reflection" — a single replace() would leave the
    // second token raw in the prompt the model sees
    const out = composePrompt('[[e1]] смотрит на отражение [[e1]]', [{ placeholder: 'e1', entityId: 'ent_1' }], {
      ent_1: anya,
    })
    expect(out).not.toContain('[[e1]]')
    expect(out.match(/Аня/g)).toHaveLength(2)
  })

  it('substitutes multiple distinct placeholders', () => {
    const out = composePrompt(
      '[[e1]] гуляет с [[e2]]',
      [
        { placeholder: 'e1', entityId: 'ent_1' },
        { placeholder: 'e2', entityId: 'ent_2' },
      ],
      { ent_1: anya, ent_2: rex },
    )
    expect(out).toBe('Аня (женщина, тёмные волосы) гуляет с Rex (german shepherd)')
  })

  it('does not let one entity name be re-substituted by a later pass', () => {
    // An entity literally named "[[e2]]" must not become a substitution target.
    // A naive sequential string-replace loop would rewrite it on the next pass.
    const evil = { id: 'ent_3', name: '[[e2]]', description: '' }
    const out = composePrompt(
      '[[e1]] и [[e2]]',
      [
        { placeholder: 'e1', entityId: 'ent_3' },
        { placeholder: 'e2', entityId: 'ent_2' },
      ],
      { ent_3: evil, ent_2: rex },
    )
    expect(out).toBe('[[e2]] и Rex (german shepherd)')
  })

  it('throws when a placeholder in the prompt has no ref (never send a raw token)', () => {
    expect(() => composePrompt('[[e1]] и [[e2]]', [{ placeholder: 'e1', entityId: 'ent_1' }], { ent_1: anya })).toThrow(
      /unresolved placeholder/i,
    )
  })

  it('throws when a ref points at an entity that was not loaded (deleted / not owned)', () => {
    expect(() => composePrompt('[[e1]] стоит', [{ placeholder: 'e1', entityId: 'ghost' }], {})).toThrow(
      /unknown entity/i,
    )
  })

  it('leaves a prompt without placeholders untouched', () => {
    expect(composePrompt('просто закат', [], {})).toBe('просто закат')
  })
})
