// Contract tests for openCreator (ADR opencreator-agent): pin the message
// content union (the SPA renders cards by `kind`, so an unknown kind must be a
// parse failure rather than a blank card), the session detail shape the poll
// returns, and the bounds on the one field a user types.
import { describe, expect, it } from 'vitest'
import {
  createCreatorSessionInputSchema,
  creatorMessageContentSchema,
  creatorSessionDetailSchema,
  creatorSessionListSchema,
} from './creator'

describe('creatorMessageContentSchema', () => {
  it('accepts a text entry', () => {
    expect(creatorMessageContentSchema.safeParse({ kind: 'text', text: 'сделай лиса' }).success).toBe(
      true,
    )
  })

  it('accepts a step entry with artifact ids and a cost', () => {
    const parsed = creatorMessageContentSchema.safeParse({
      kind: 'step',
      tool: 'start_generation',
      title: 'Сцена 1',
      status: 'done',
      generationId: 'g1',
      canvasId: 'c1',
      costCredits: 5,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a plan entry (the budget gate card)', () => {
    const parsed = creatorMessageContentSchema.safeParse({
      kind: 'plan',
      summary: '5 сцен + 1 видео',
      items: [
        { label: 'Сцена 1 — Flux', credits: 5 },
        { label: 'Видео — Swift', credits: 35 },
      ],
      totalCredits: 40,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a result entry with links', () => {
    const parsed = creatorMessageContentSchema.safeParse({
      kind: 'result',
      text: 'Готово',
      canvasId: 'c1',
      entityId: 'e1',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown kind', () => {
    // The SPA switches on `kind`; a kind it cannot render must never parse.
    expect(creatorMessageContentSchema.safeParse({ kind: 'chart', data: [] }).success).toBe(false)
  })

  it('rejects a step with an unknown status', () => {
    expect(
      creatorMessageContentSchema.safeParse({
        kind: 'step',
        tool: 'create_canvas',
        title: 'Канвас',
        status: 'running',
      }).success,
    ).toBe(false)
  })

  it('rejects negative plan credits', () => {
    expect(
      creatorMessageContentSchema.safeParse({
        kind: 'plan',
        summary: 's',
        items: [{ label: 'refund?', credits: -5 }],
        totalCredits: 0,
      }).success,
    ).toBe(false)
  })
})

describe('creatorSessionDetailSchema', () => {
  it('parses a full session with mixed message kinds', () => {
    const now = new Date().toISOString()
    const parsed = creatorSessionDetailSchema.safeParse({
      id: 's1',
      title: 'сделай ролик про лиса',
      status: 'awaiting_confirm',
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: 'm1', role: 'user', content: { kind: 'text', text: 'сделай ролик' }, createdAt: now },
        {
          id: 'm2',
          role: 'assistant',
          content: { kind: 'step', tool: 'create_canvas', title: 'Канвас создан', status: 'done' },
          createdAt: now,
        },
        {
          id: 'm3',
          role: 'assistant',
          content: { kind: 'plan', summary: 'план', items: [], totalCredits: 40 },
          createdAt: now,
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown session status', () => {
    expect(
      creatorSessionDetailSchema.safeParse({
        id: 's1',
        title: 't',
        status: 'paused',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      }).success,
    ).toBe(false)
  })
})

describe('creatorSessionListSchema', () => {
  it('parses the left-rail list shape', () => {
    const now = new Date().toISOString()
    expect(
      creatorSessionListSchema.safeParse({
        items: [{ id: 's1', title: 't', status: 'idle', createdAt: now, updatedAt: now }],
      }).success,
    ).toBe(true)
  })
})

describe('createCreatorSessionInputSchema', () => {
  it('accepts a task', () => {
    expect(createCreatorSessionInputSchema.safeParse({ message: 'сделай лиса' }).success).toBe(true)
  })

  it('rejects a 1-char message', () => {
    expect(createCreatorSessionInputSchema.safeParse({ message: 'a' }).success).toBe(false)
  })

  it('rejects a message over 2000 chars', () => {
    expect(
      createCreatorSessionInputSchema.safeParse({ message: 'a'.repeat(2001) }).success,
    ).toBe(false)
  })
})
