// The variants table's data, as plain list operations. Duplicating a row and
// then editing one cell is the INTENDED flow (ADR shorts-studio §9: a batch
// varies by default, and N identical rows is the degenerate case), so the
// operations that flow depends on are pinned here.
//
// Row identity is a generated id, never an array index: deleting row 2 of five
// must not silently re-point row 3's edits at row 4's data.
import { describe, expect, it } from 'vitest'
import {
  duplicateRow,
  isRowComplete,
  patchRowTitle,
  patchRowVariable,
  removeRow,
  seedRow,
  toBatchRows,
} from './variantRows'
import { SHORTS_TEMPLATE } from './testFixtures'

describe('seedRow', () => {
  it('fills every knob from its declared default, so a fresh row is runnable', () => {
    expect(seedRow(SHORTS_TEMPLATE, 'r1')).toEqual({
      id: 'r1',
      title: '',
      variables: { hook: 'What do you regret most?', setting: 'tokyo' },
    })
  })
})

describe('duplicateRow', () => {
  it('inserts the copy directly AFTER its source, with the same values', () => {
    // Right after, not at the end: the copy is a variation on the row the user
    // was just looking at, and a table that scrolls away from the gesture is a
    // table people stop using.
    const rows = [seedRow(SHORTS_TEMPLATE, 'a'), seedRow(SHORTS_TEMPLATE, 'b')]
    const edited = patchRowVariable(rows, 'a', 'hook', 'What do you miss?')
    const next = duplicateRow(edited, 'a', 'copy')
    expect(next.map((row) => row.id)).toEqual(['a', 'copy', 'b'])
    expect(next.map((row) => row.variables['hook'])).toEqual([
      'What do you miss?',
      'What do you miss?',
      'What do you regret most?',
    ])
  })

  it('copies the values rather than sharing them', () => {
    const rows = [seedRow(SHORTS_TEMPLATE, 'a')]
    const next = patchRowVariable(duplicateRow(rows, 'a', 'copy'), 'copy', 'hook', 'changed')
    expect(next.map((row) => row.variables['hook'])).toEqual([
      'What do you regret most?',
      'changed',
    ])
  })

  it('leaves the table untouched when the source id is unknown', () => {
    const rows = [seedRow(SHORTS_TEMPLATE, 'a')]
    expect(duplicateRow(rows, 'ghost', 'copy')).toEqual(rows)
  })
})

describe('removeRow', () => {
  it('removes by id and leaves every other row identical', () => {
    const rows = ['a', 'b', 'c'].map((id) => seedRow(SHORTS_TEMPLATE, id))
    const next = removeRow(rows, 'b')
    expect(next.map((row) => row.id)).toEqual(['a', 'c'])
    // Same object, not a rebuilt equal one: an untouched row must not re-render.
    expect(next[1]).toBe(rows[2])
  })
})

describe('patchRowVariable', () => {
  it('changes one cell of one row', () => {
    const rows = ['a', 'b'].map((id) => seedRow(SHORTS_TEMPLATE, id))
    const next = patchRowVariable(rows, 'b', 'setting', 'lisbon')
    expect(next.map((row) => row.variables['setting'])).toEqual(['tokyo', 'lisbon'])
    expect(next[0]).toBe(rows[0])
  })

  it('cannot reach the row title, even for a template knob called "title"', () => {
    // Two namespaces, two operations. A shared one keyed by string would let a
    // template that declares a {{title}} knob overwrite the film's own name.
    const next = patchRowVariable([seedRow(SHORTS_TEMPLATE, 'a')], 'a', 'title', 'knob value')
    expect(next.map((row) => row.title)).toEqual([''])
    expect(next.map((row) => row.variables['title'])).toEqual(['knob value'])
  })
})

describe('patchRowTitle', () => {
  it('sets the film title without touching the knobs', () => {
    const next = patchRowTitle([seedRow(SHORTS_TEMPLATE, 'a')], 'a', 'Regret · Tokyo')
    expect(next.map((row) => row.title)).toEqual(['Regret · Tokyo'])
    expect(next.map((row) => row.variables['hook'])).toEqual(['What do you regret most?'])
  })
})

describe('isRowComplete', () => {
  it('is false while any knob is blank — the server would reject the substitution', () => {
    const blank = { id: 'a', title: '', variables: { hook: '   ', setting: 'tokyo' } }
    expect(isRowComplete(SHORTS_TEMPLATE, blank)).toBe(false)
  })

  it('is false when a knob the template declares is missing entirely', () => {
    expect(isRowComplete(SHORTS_TEMPLATE, { id: 'a', title: '', variables: {} })).toBe(false)
  })

  it('is false when a SELECT value is outside its declared option set', () => {
    // The batch endpoint has NO partial success: one bad row rejects all twenty
    // and writes nothing, and the 400 is prose naming a key, not a per-row list
    // this table could highlight from. So the closed set is checked here, before
    // the POST, rather than discovered from a refusal.
    const off = { id: 'a', title: '', variables: { hook: 'why?', setting: 'atlantis' } }
    expect(isRowComplete(SHORTS_TEMPLATE, off)).toBe(false)
  })

  it('is true for a select value that IS in the set', () => {
    const ok = { id: 'a', title: '', variables: { hook: 'why?', setting: 'lisbon' } }
    expect(isRowComplete(SHORTS_TEMPLATE, ok)).toBe(true)
  })

  it('is true for a seeded row', () => {
    expect(isRowComplete(SHORTS_TEMPLATE, seedRow(SHORTS_TEMPLATE, 'a'))).toBe(true)
  })
})

describe('toBatchRows', () => {
  it('drops the client id and omits an empty title, which the server composes', () => {
    expect(toBatchRows([seedRow(SHORTS_TEMPLATE, 'a')])).toEqual([
      { variables: { hook: 'What do you regret most?', setting: 'tokyo' } },
    ])
  })

  it('keeps a title the user actually wrote, trimmed', () => {
    const rows = patchRowTitle([seedRow(SHORTS_TEMPLATE, 'a')], 'a', '  Tokyo regret  ')
    expect(toBatchRows(rows).map((row) => row.title)).toEqual(['Tokyo regret'])
  })
})
