import { describe, expect, it } from 'vitest'
import { deriveEntityRefs, nextPlaceholder } from './mentions'

describe('nextPlaceholder', () => {
  it('starts at e1', () => {
    expect(nextPlaceholder([])).toBe('e1')
  })
  it('avoids collisions with existing placeholders', () => {
    expect(nextPlaceholder([{ placeholder: 'e1', entityId: 'a' }])).toBe('e2')
    // Gaps are fine — it only needs to be unused, not contiguous
    expect(nextPlaceholder([{ placeholder: 'e3', entityId: 'a' }])).toBe('e1')
  })
})

describe('deriveEntityRefs', () => {
  const mentions = [
    { placeholder: 'e1', entityId: 'ent_a' },
    { placeholder: 'e2', entityId: 'ent_b' },
  ]

  it('returns only refs whose token is still present in the prompt', () => {
    // The user tagged two but deleted the [[e2]] token from the text — that ref
    // must NOT be sent, or the API rejects the orphan / bills a phantom tag
    expect(deriveEntityRefs('[[e1]] стоит', mentions)).toEqual([
      { placeholder: 'e1', entityId: 'ent_a' },
    ])
  })

  it('returns both when both tokens are present', () => {
    expect(deriveEntityRefs('[[e1]] и [[e2]]', mentions)).toEqual(mentions)
  })

  it('returns empty when no token survives', () => {
    expect(deriveEntityRefs('просто закат', mentions)).toEqual([])
  })

  it('ignores a mention whose entity is unknown to the list (defensive)', () => {
    expect(deriveEntityRefs('[[e9]] стоит', mentions)).toEqual([])
  })
})
