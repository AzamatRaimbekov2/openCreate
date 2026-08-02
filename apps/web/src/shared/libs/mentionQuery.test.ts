import { describe, expect, it } from 'vitest'
import { applyMention, findActiveMention } from './mentionQuery'

describe('findActiveMention', () => {
  it('detects an @query the caret sits inside', () => {
    // "hello @ar" — caret at end (9)
    expect(findActiveMention('hello @ar', 9)).toEqual({ start: 6, query: 'ar' })
  })

  it('detects an @ at the very start', () => {
    expect(findActiveMention('@a', 2)).toEqual({ start: 0, query: 'a' })
  })

  it('detects a bare @ with an empty query', () => {
    expect(findActiveMention('@', 1)).toEqual({ start: 0, query: '' })
  })

  it('detects @ right after whitespace', () => {
    expect(findActiveMention('a b @x', 6)).toEqual({ start: 4, query: 'x' })
  })

  it('does NOT trigger on an @ inside a word (e.g. an email)', () => {
    expect(findActiveMention('mail me@example', 15)).toBeNull()
  })

  it('does NOT trigger once whitespace follows the @', () => {
    // caret is after "and", past the space that closed the mention
    expect(findActiveMention('hi @bob and', 11)).toBeNull()
  })

  it('returns null when there is no @ before the caret', () => {
    expect(findActiveMention('no at here', 10)).toBeNull()
  })

  it('uses the caret, not end-of-text (mid-string editing)', () => {
    // "@ab cd" but caret is at 2 → query is just "a"
    expect(findActiveMention('@ab cd', 2)).toEqual({ start: 0, query: 'a' })
  })
})

describe('applyMention', () => {
  it('replaces the @query with the token + a trailing space at end of text', () => {
    const out = applyMention('hi @ar', { start: 3, query: 'ar' }, 6, '[[e1]]')
    expect(out).toEqual({ text: 'hi [[e1]] ', caret: 10 })
  })

  it('does not double a space when text already follows', () => {
    const out = applyMention('a @x b', { start: 2, query: 'x' }, 4, '[[e1]]')
    expect(out).toEqual({ text: 'a [[e1]] b', caret: 8 })
  })

  it('replaces a bare @ (empty query)', () => {
    const out = applyMention('@', { start: 0, query: '' }, 1, '[[e2]]')
    expect(out).toEqual({ text: '[[e2]] ', caret: 7 })
  })
})
