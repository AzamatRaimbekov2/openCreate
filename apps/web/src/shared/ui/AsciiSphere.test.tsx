// apps/web/src/shared/ui/AsciiSphere.test.tsx
// Behavior: AsciiSphere is a decorative dependency-free ASCII ellipsoid on a
// <canvas>. Contract under test: the canvas is aria-hidden and merges the
// caller className; without a 2d context it renders inert (no loop, no crash);
// with a context it draws frames through a ~30fps-capped rAF loop and cancels
// it on unmount; with prefers-reduced-motion it draws ONE static frame and
// never starts the loop.
import { render } from '@testing-library/react'
import { AsciiSphere } from './AsciiSphere'

// The exact 2d-surface subset the sphere draws with — typing the stub AS this
// Pick makes `stub as CanvasRenderingContext2D` a safe widening (the full
// context is assignable to its own Pick), so no unsafe double casts are needed
type Ctx2dStub = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'fillText'
  | 'setTransform'
  | 'fillStyle'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>

// Minimal drawable stub + the fillText mock kept typed for call assertions
function makeContextStub() {
  const fillText = vi.fn()
  const stub: Ctx2dStub = {
    clearRect: vi.fn(),
    fillText,
    setTransform: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  return { stub, fillText }
}

// Complete MediaQueryList stub (no casts needed) for the reduced-motion query
function makeMatchMedia(matches: boolean) {
  return (query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })
}

// jsdom has no layout — give every canvas a real box so the char grid exists
beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    value: 640,
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    value: 480,
  })
})

// Manually driven rAF: callbacks queue up and the test invokes them with
// explicit timestamps to verify the ~30fps cap deterministically
let rafCallbacks: FrameRequestCallback[]
let rafSpy: ReturnType<typeof vi.spyOn>
let cancelSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  rafCallbacks = []
  rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AsciiSphere', () => {
  it('renders a decorative aria-hidden canvas and merges the caller className', () => {
    // No drawable surface (jsdom default) — the component must stay inert
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { container } = render(<AsciiSphere className="absolute inset-0" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveClass('absolute', 'inset-0')
    // Without a context there is nothing to animate
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('draws through a frame-capped rAF loop and cancels it on unmount', () => {
    const { stub, fillText } = makeContextStub()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stub as CanvasRenderingContext2D,
    )
    const { unmount } = render(<AsciiSphere />)
    // The first frame paints synchronously (no blank canvas before rAF ticks)
    expect(fillText.mock.calls.length).toBeGreaterThan(0)
    expect(rafSpy).toHaveBeenCalledTimes(1)

    // A tick past the 33ms budget draws a new frame…
    const afterMount = fillText.mock.calls.length
    rafCallbacks[0]?.(1000)
    expect(fillText.mock.calls.length).toBeGreaterThan(afterMount)

    // …but a tick 10ms later is SKIPPED by the ~30fps cap (still re-scheduled)
    const afterFirstTick = fillText.mock.calls.length
    rafCallbacks[1]?.(1010)
    expect(fillText.mock.calls.length).toBe(afterFirstTick)
    expect(rafCallbacks.length).toBeGreaterThanOrEqual(3)

    // Unmount stops the loop — no leaked animation frames
    unmount()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('renders one static frame without a loop under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', makeMatchMedia(true))
    const { stub, fillText } = makeContextStub()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stub as CanvasRenderingContext2D,
    )
    render(<AsciiSphere />)
    // The static frame IS drawn…
    expect(fillText.mock.calls.length).toBeGreaterThan(0)
    // …but no animation loop ever starts
    expect(rafSpy).not.toHaveBeenCalled()
  })
})
