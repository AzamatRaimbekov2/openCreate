// apps/web/src/modules/Soul/model/randomizeDraft.test.ts
// Shuffle must always hand back a VALID character: the two required axes set and
// never more than MAX_TRAITS traits — the two invariants the schema and the API
// enforce, proven here so the dice button cannot produce a draft that 400s.
import { MAX_TRAITS, soulSchema } from '@opencreate/contracts'
import { randomizeDraft } from './randomizeDraft'

describe('randomizeDraft', () => {
  it('always sets the two required axes and stays within the trait cap', () => {
    // Randomness: assert the invariants across many draws, not one lucky roll
    for (let i = 0; i < 200; i += 1) {
      const { soul } = randomizeDraft()
      expect(soul.archetype).toBeTruthy()
      expect(soul.styleId).toBeTruthy()
      expect(soul.traits.length).toBeLessThanOrEqual(MAX_TRAITS)
      // Distinct traits — a duplicate is a wasted concept and a schema smell
      expect(new Set(soul.traits).size).toBe(soul.traits.length)
      // The strongest proof it is buildable: the contract schema accepts it
      expect(soulSchema.safeParse(soul).success).toBe(true)
    }
  })
})
