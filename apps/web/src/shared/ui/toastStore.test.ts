// apps/web/src/shared/ui/toastStore.test.ts
// The toast store is pure state (no timers, no DOM) — the Toaster owns the
// lifecycle. These pin the four contract behaviours: push adds and returns an
// id, dismiss removes by id, a dedupeKey collapses a repeat push to ONE live
// toast (so a re-poll cannot spam), and the stack is capped so a burst never
// buries the screen (oldest drops first).
import { useToastStore } from './toastStore'

beforeEach(() => {
  useToastStore.getState().clear()
})

describe('toastStore', () => {
  it('pushes a toast and returns its id', () => {
    const id = useToastStore.getState().push({ variant: 'error', title: 'boom' })
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ id, variant: 'error', title: 'boom' })
  })

  it('dismisses a toast by id', () => {
    const id = useToastStore.getState().push({ variant: 'info', title: 'hi' })
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('collapses a repeat push with the same dedupeKey to one live toast', () => {
    const store = useToastStore.getState()
    const first = store.push({ variant: 'error', title: 'a', dedupeKey: 'k' })
    const second = store.push({ variant: 'error', title: 'a again', dedupeKey: 'k' })
    expect(second).toBe(first)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    // The FIRST push wins — a re-poll must not overwrite the live copy's content
    expect(useToastStore.getState().toasts[0]?.title).toBe('a')
  })

  it('lets the same dedupeKey fire again once its toast is dismissed', () => {
    const store = useToastStore.getState()
    const first = store.push({ variant: 'error', title: 'x', dedupeKey: 'k' })
    store.dismiss(first)
    const second = store.push({ variant: 'error', title: 'x', dedupeKey: 'k' })
    expect(second).not.toBe(first)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('caps the stack at three, dropping the oldest', () => {
    const store = useToastStore.getState()
    store.push({ variant: 'info', title: '1' })
    store.push({ variant: 'info', title: '2' })
    store.push({ variant: 'info', title: '3' })
    store.push({ variant: 'info', title: '4' })
    const titles = useToastStore.getState().toasts.map((toast) => toast.title)
    expect(titles).toEqual(['2', '3', '4'])
  })
})
