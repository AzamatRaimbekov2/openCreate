import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'

describe('db', () => {
  it('creates all tables in memory', () => {
    const { sqlite } = createDb(':memory:')
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of [
      'user',
      'session',
      'account',
      'verification',
      'generation',
      'credit_transaction',
    ]) {
      expect(tables).toContain(t)
    }
  })
})
