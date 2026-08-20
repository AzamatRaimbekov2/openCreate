// How a beat's status is DERIVED. ADR shorts-studio §2: there is no batch table,
// no job rows and no status machine — a beat's progress is the live status of the
// generation its shot cites. This file pins the derivation, and above all pins
// which source wins when two of them disagree:
//
//   the shared ['generation', id] CACHE is the truth about a clip that exists.
//   the run store only supplies what the cache CANNOT know: a beat that is still
//   queued, a POST that is in flight, and a submit that failed before any
//   generation row was ever created (insufficient_credits above all — there is no
//   cache entry to read, and a runner that stops without saying why is
//   indistinguishable from one that finished).
import { describe, expect, it } from 'vitest'
import type { ApiErrorCode, Generation, Shot } from '@opencreate/contracts'
import { batchProgress, beatGenerationId, beatState, isGeneratedBeat } from './boardStatus'
import type { BatchRunItem } from './boardStatus'

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  id: 's1',
  filmId: 'f1',
  orderIndex: 0,
  generationId: null,
  prompt: 'a fox crosses the street',
  promptPreset: null,
  entityRefs: [],
  referenceImages: [],
  modelId: 'wan-2-7',
  aspectRatio: '9:16',
  durationMs: 8000,
  trimStartMs: 0,
  transition: 'none',
  transitionMs: 0,
  title: null,
  voiceover: null,
  audio: false,
  createdAt: '2026-08-20T10:00:00.000Z',
  ...overrides,
})

const titleCard = () => shot({ id: 's0', prompt: '', modelId: null })

const generation = (
  status: Generation['status'],
  errorCode: ApiErrorCode | null = null,
): Pick<Generation, 'status' | 'errorCode'> => ({ status, errorCode })

const runItem = (overrides: Partial<BatchRunItem> = {}): BatchRunItem => ({
  filmId: 'f1',
  shotId: 's1',
  status: 'queued',
  generationId: null,
  errorCode: null,
  ...overrides,
})

describe('isGeneratedBeat', () => {
  it('is true for a beat with a pinned model and a prompt', () => {
    expect(isGeneratedBeat(shot())).toBe(true)
  })

  it('is false for a title card — it costs nothing and must never be submitted', () => {
    expect(isGeneratedBeat(titleCard())).toBe(false)
  })
})

describe('beatGenerationId', () => {
  it('prefers the shot, which is the persisted citation', () => {
    expect(beatGenerationId(shot({ generationId: 'g1' }), undefined)).toBe('g1')
  })

  it('falls back to the run item between the submit and the PATCH landing', () => {
    // A generation exists server-side the instant POST /generations answers, but
    // shot.generationId only catches up one request later. Without this the beat
    // would blink back to "draft" mid-run, next to a clip that is already paid for.
    expect(beatGenerationId(shot(), runItem({ generationId: 'g1' }))).toBe('g1')
  })

  it('is null for a beat nothing has been submitted for', () => {
    expect(beatGenerationId(shot(), runItem())).toBeNull()
  })
})

describe('beatState', () => {
  it('is free for a title card, whatever else is going on', () => {
    expect(beatState(titleCard(), undefined, undefined).status).toBe('free')
  })

  it('is draft for an untouched beat outside any run', () => {
    expect(beatState(shot(), undefined, undefined).status).toBe('draft')
  })

  it('reads queued and submitting off the run store — the cache cannot know them', () => {
    expect(beatState(shot(), runItem({ status: 'queued' }), undefined).status).toBe('queued')
    expect(beatState(shot(), runItem({ status: 'submitting' }), undefined).status).toBe(
      'submitting',
    )
  })

  it('reads succeeded and failed off the CACHE, not off the run store', () => {
    const done = shot({ generationId: 'g1' })
    expect(beatState(done, runItem({ status: 'submitting' }), generation('succeeded')).status).toBe(
      'succeeded',
    )
    expect(
      beatState(done, runItem({ status: 'submitting' }), generation('failed', 'content_blocked')),
    ).toEqual({ status: 'failed', errorCode: 'content_blocked' })
  })

  it('lets the cache overrule a stale run item, so a remount cannot resurrect it', () => {
    // The run store outlives the run. A beat the store still calls "queued" but
    // whose clip landed is SUCCEEDED — the board must never contradict the media
    // it is showing.
    const done = shot({ generationId: 'g1' })
    expect(beatState(done, runItem({ status: 'queued' }), generation('succeeded')).status).toBe(
      'succeeded',
    )
  })

  it('is processing while a cited generation has not settled', () => {
    expect(beatState(shot({ generationId: 'g1' }), undefined, generation('processing')).status).toBe(
      'processing',
    )
  })

  it('is processing when a clip is cited but its cache entry has not arrived yet', () => {
    // The reload case: the shot cites a generation, the fetch is in flight. The
    // beat is live until proven otherwise — never "draft", which would offer a
    // Generate button for a clip that is already paid for.
    expect(beatState(shot({ generationId: 'g1' }), undefined, undefined).status).toBe('processing')
  })

  it('surfaces a submit that never created a generation row', () => {
    // insufficient_credits mid-batch: no generation exists, so the cache has
    // nothing to say and only the run store knows why this beat is dead.
    const failed = runItem({ status: 'failed', errorCode: 'insufficient_credits' })
    expect(beatState(shot(), failed, undefined)).toEqual({
      status: 'failed',
      errorCode: 'insufficient_credits',
    })
  })
})

describe('batchProgress', () => {
  it('counts only beats that can run, and calls the batch done when none are live', () => {
    const states = [
      { status: 'free' as const, errorCode: null },
      { status: 'succeeded' as const, errorCode: null },
      { status: 'succeeded' as const, errorCode: null },
      { status: 'failed' as const, errorCode: 'provider_error' },
    ]
    expect(batchProgress(states)).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      pending: 0,
      isSettled: true,
    })
  })

  it('is unsettled while anything is still queued, submitting or processing', () => {
    const states = [
      { status: 'succeeded' as const, errorCode: null },
      { status: 'processing' as const, errorCode: null },
    ]
    expect(batchProgress(states)).toMatchObject({ pending: 1, isSettled: false })
  })

  it('is unsettled for a batch that has not started', () => {
    expect(batchProgress([{ status: 'draft', errorCode: null }])).toMatchObject({
      pending: 1,
      isSettled: false,
    })
  })
})
