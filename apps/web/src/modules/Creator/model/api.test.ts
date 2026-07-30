// The two rules of the creator chat's data layer, pinned as pure functions so
// they can be asserted without a live query:
//   1. WHEN to poll — a session with a detached turn (or a plan the user has not
//      answered) is still moving; a settled one must stop costing requests.
//   2. WHAT a 202 does to the cache — every POST answers with the transcript so
//      far, so the mutation writes it instead of triggering a refetch storm.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { CreatorSession, CreatorSessionDetail } from '@opencreate/contracts'
import { CREATOR_POLL_INTERVAL_MS, absorbSessionDetail, sessionPollInterval } from './api'

const detail = (
  id: string,
  status: CreatorSessionDetail['status'],
  title = 'a fox on a board',
): CreatorSessionDetail => ({
  id,
  title,
  status,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:05.000Z',
  messages: [
    { id: 'm1', role: 'user', content: { kind: 'text', text: title }, createdAt: '2026-07-30T10:00:00.000Z' },
  ],
})

const summary = (id: string, status: CreatorSession['status']): CreatorSession => ({
  id,
  title: 'a fox on a board',
  status,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:05.000Z',
})

describe('sessionPollInterval', () => {
  it('polls a running session — a detached turn writes messages we have not seen', () => {
    expect(sessionPollInterval({ status: 'success', data: detail('s1', 'running') })).toBe(
      CREATOR_POLL_INTERVAL_MS,
    )
  })

  it('keeps polling an awaiting_confirm session so a plan answered elsewhere goes stale here', () => {
    // The gate can be left WITHOUT this tab acting: a second tab confirms, a new
    // message resets the budget, the stale reaper fails the turn. Stopping the
    // poll here would leave a live «Подтвердить» button over a dead plan.
    expect(sessionPollInterval({ status: 'success', data: detail('s1', 'awaiting_confirm') })).toBe(
      CREATOR_POLL_INTERVAL_MS,
    )
  })

  it('stops for a settled session (idle / failed) — nothing moves until the user types', () => {
    expect(sessionPollInterval({ status: 'success', data: detail('s1', 'idle') })).toBe(false)
    expect(sessionPollInterval({ status: 'success', data: detail('s1', 'failed') })).toBe(false)
  })

  it('stops when the first load failed — never hammer an id that answered an error', () => {
    expect(sessionPollInterval({ status: 'error', data: undefined })).toBe(false)
  })

  it('survives a transient refetch error on a session it already knows is running', () => {
    // One dropped GET mid-turn is not a dead session: the transcript we hold
    // still says a turn is executing, so the loop must recover, not give up.
    expect(sessionPollInterval({ status: 'error', data: detail('s1', 'running') })).toBe(
      CREATOR_POLL_INTERVAL_MS,
    )
  })

  it('stops while nothing has loaded yet (no session selected)', () => {
    expect(sessionPollInterval({ status: 'pending', data: undefined })).toBe(false)
  })
})

describe('absorbSessionDetail', () => {
  it('writes the returned transcript into the detail cache (the 202 IS the answer)', () => {
    const queryClient = new QueryClient()
    const next = detail('s1', 'running')
    absorbSessionDetail(queryClient, next)
    expect(queryClient.getQueryData(['creator-session', 's1'])).toEqual(next)
  })

  it('prepends a brand-new session to the rail — the newest conversation leads', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['creator-sessions'], { items: [summary('old', 'idle')] })
    absorbSessionDetail(queryClient, detail('s2', 'running', 'new task'))
    const list = queryClient.getQueryData<{ items: CreatorSession[] }>(['creator-sessions'])
    expect(list?.items.map((item) => item.id)).toEqual(['s2', 'old'])
  })

  it('updates an existing rail row IN PLACE so the list does not reshuffle mid-turn', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['creator-sessions'], {
      items: [summary('a', 'idle'), summary('b', 'idle')],
    })
    absorbSessionDetail(queryClient, detail('b', 'running'))
    const list = queryClient.getQueryData<{ items: CreatorSession[] }>(['creator-sessions'])
    expect(list?.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(list?.items[1]?.status).toBe('running')
  })

  it('does not fabricate a rail that was never loaded', () => {
    const queryClient = new QueryClient()
    absorbSessionDetail(queryClient, detail('s1', 'running'))
    expect(queryClient.getQueryData(['creator-sessions'])).toBeUndefined()
  })

  it('carries no messages into the rail row — the list is summaries only', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['creator-sessions'], { items: [] })
    absorbSessionDetail(queryClient, detail('s1', 'running'))
    const list = queryClient.getQueryData<{ items: CreatorSession[] }>(['creator-sessions'])
    expect(list?.items[0] && 'messages' in list.items[0]).toBe(false)
  })
})
