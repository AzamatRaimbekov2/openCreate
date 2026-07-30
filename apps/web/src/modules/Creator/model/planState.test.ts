// WHEN a plan card's «Подтвердить» button may be clicked. This is the money
// question of the whole screen, so it is decided by a pure function over the
// transcript rather than by each card guessing from its own content:
//   live     — the session is at the gate AND this is the newest thing said
//   answered — something happened after this plan; the transcript below says what
//   stale    — the gate is gone and nothing followed, so this plan died unanswered
import { describe, expect, it } from 'vitest'
import type { CreatorMessage } from '@opencreate/contracts'
import { planStateFor } from './planState'

const text = (id: string, role: CreatorMessage['role'], body: string): CreatorMessage => ({
  id,
  role,
  content: { kind: 'text', text: body },
  createdAt: '2026-07-30T10:00:00.000Z',
})

const plan = (id: string): CreatorMessage => ({
  id,
  role: 'assistant',
  content: {
    kind: 'plan',
    summary: 'one image of a fox',
    items: [{ label: 'image · flux dev', credits: 2 }],
    totalCredits: 2,
  },
  createdAt: '2026-07-30T10:00:01.000Z',
})

describe('planStateFor', () => {
  it('is live when the session waits at the gate and the plan is the newest message', () => {
    const messages = [text('m1', 'user', 'нарисуй лиса'), plan('m2')]
    expect(planStateFor(messages, 1, 'awaiting_confirm')).toBe('live')
  })

  it('is answered once anything follows the plan — the transcript below tells the story', () => {
    // Both paths land here: the server's «Бюджет подтверждён…» line after a
    // confirm, and the user's new message that RESET the budget flag.
    const messages = [plan('m1'), text('m2', 'assistant', 'Бюджет подтверждён — выполняю план.')]
    expect(planStateFor(messages, 0, 'running')).toBe('answered')
  })

  it('is answered even while the session sits at a NEWER gate', () => {
    // A second plan supersedes the first; only the newest one is clickable, or
    // one click could confirm a budget the agent has already replaced.
    const messages = [plan('m1'), text('m2', 'user', 'нет, дороже'), plan('m3')]
    expect(planStateFor(messages, 0, 'awaiting_confirm')).toBe('answered')
    expect(planStateFor(messages, 2, 'awaiting_confirm')).toBe('live')
  })

  it('is stale when the gate is gone and nothing followed (the turn died at the plan)', () => {
    const messages = [text('m1', 'user', 'нарисуй лиса'), plan('m2')]
    expect(planStateFor(messages, 1, 'failed')).toBe('stale')
    expect(planStateFor(messages, 1, 'idle')).toBe('stale')
  })

  it('never reports live while a turn is running, even for the newest plan', () => {
    const messages = [plan('m1')]
    expect(planStateFor(messages, 0, 'running')).toBe('stale')
  })
})
