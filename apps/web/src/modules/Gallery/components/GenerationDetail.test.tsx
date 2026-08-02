// apps/web/src/modules/Gallery/components/GenerationDetail.test.tsx
// The detail sheet is the FULL-SCREEN viewer (owner request 2026-08-02): a
// media stage on the left, an information column on the right, and every
// action behind the three-dots menu.
//
// Pinned here:
//  1. the sheet is the full-screen size (a 9:16 clip opened in a max-w-lg
//     stamp was the complaint that started this)
//  2. the information column NAMES the model — a route that hands the catalog
//     down shows "Pixverse v6", one that does not falls back to the raw id
//     rather than printing nothing
//  3. actions are ONLY in the ⋯ menu — the old icon rail put Delete one
//     mis-click away from the media it destroys
//  4. the information column scrolls its own body: contracts allow a
//     2000-character prompt, and the kit Modal is a flex column whose children
//     default to min-height:auto (design.md §6 Modal law)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Generation } from '@opencreate/contracts'
import { GenerationDetail } from './GenerationDetail'
import 'shared/config/i18n'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const GENERATION = {
  id: 'g1',
  type: 'image',
  mode: 'text',
  status: 'succeeded',
  // A prompt at the contract's ceiling is exactly the case that overflows
  prompt: 'a lone figure on a bridge above a wide city, '.repeat(40),
  modelId: 'flux-schnell',
  params: { aspectRatio: '1:1' },
  costCredits: 1,
  mediaUrls: ['/media/a.png'],
  errorMessage: null,
  createdAt: '2026-07-31T10:00:00.000Z',
  completedAt: '2026-07-31T10:00:05.000Z',
} as unknown as Generation

const VIDEO = {
  ...GENERATION,
  id: 'g2',
  type: 'video',
  prompt: 'ocean waves at dusk',
  modelId: 'pixverse-v6',
  params: { aspectRatio: '9:16', duration: 5 },
  costCredits: 35,
  mediaUrls: ['/media/g2.mp4'],
} as unknown as Generation

it('opens as a full-screen sheet, not a stamp', () => {
  render(<GenerationDetail generation={VIDEO} isOpen onClose={vi.fn()} />, { wrapper })

  // The class IS the requirement here — "full screen" has no other sensor in
  // jsdom, which lays nothing out
  expect(screen.getByRole('dialog')).toHaveClass('h-[92dvh]')
})

it('scrolls the information column so a long prompt cannot push the meta off the sheet', () => {
  render(<GenerationDetail generation={GENERATION} isOpen onClose={vi.fn()} />, { wrapper })

  const scroller = screen.getByRole('dialog').querySelector('.overflow-y-auto')
  expect(scroller).not.toBeNull()
  // min-h-0 is the half that does the work — without it the flex child refuses
  // to shrink below its content and overflow-y-auto never engages.
  expect(scroller).toHaveClass('min-h-0')
})

it('shows the prompt and the model NAME when the route hands the catalog down', () => {
  render(
    <GenerationDetail
      generation={VIDEO}
      isOpen
      onClose={vi.fn()}
      models={[{ id: 'pixverse-v6', name: 'Pixverse v6' }]}
    />,
    { wrapper },
  )

  expect(screen.getByText('ocean waves at dusk')).toBeInTheDocument()
  expect(screen.getByText('Pixverse v6')).toBeInTheDocument()
  // The id is the fallback, not a second line beside the name
  expect(screen.queryByText('pixverse-v6')).toBeNull()
})

it('falls back to the raw model id when no catalog was injected', () => {
  render(<GenerationDetail generation={VIDEO} isOpen onClose={vi.fn()} />, { wrapper })

  // A missing catalog must not blank the field — the id is still the truth
  expect(screen.getByText('pixverse-v6')).toBeInTheDocument()
})

it('hides every action behind the three-dots menu', async () => {
  const onRegenerate = vi.fn()
  render(
    <GenerationDetail generation={VIDEO} isOpen onClose={vi.fn()} onRegenerate={onRegenerate} />,
    { wrapper },
  )

  // Nothing destructive is one click away from the media
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /download/i })).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: /actions/i }))
  expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: /download/i })).toBeInTheDocument()
})

it('closes the sheet when Edit fills the composer behind it', async () => {
  const onClose = vi.fn()
  const onRegenerate = vi.fn()
  render(
    <GenerationDetail generation={VIDEO} isOpen onClose={onClose} onRegenerate={onRegenerate} />,
    { wrapper },
  )

  await userEvent.click(screen.getByRole('button', { name: /actions/i }))
  await userEvent.click(screen.getByRole('menuitem', { name: /^edit$/i }))

  expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ id: 'g2' }))
  // Staying open would hide the very input the user now wants
  expect(onClose).toHaveBeenCalled()
})

// The status badge was hardcoded to "ready" back when this sheet only ever opened
// for succeeded generations. It now opens for FAILED ones too — that is where the
// raw provider message lives — and a red-flagged card whose detail says "Готово"
// contradicts the very thing the user clicked.
it('says FAILED on a failed generation, never "ready"', () => {
  const failed = { ...GENERATION, status: 'failed', errorMessage: 'boom' } as unknown as Generation
  render(<GenerationDetail generation={failed} isOpen onClose={vi.fn()} />, { wrapper })
  expect(screen.getByText(/generation failed/i)).toBeInTheDocument()
  expect(screen.queryByText(/^ready$/i)).not.toBeInTheDocument()
})

it('shows the provider response for a failed generation', () => {
  const failed = {
    ...GENERATION,
    status: 'failed',
    errorMessage: 'Unsupported use of negativePrompt parameter',
  } as unknown as Generation
  render(<GenerationDetail generation={failed} isOpen onClose={vi.fn()} />, { wrapper })
  expect(screen.getByText('Unsupported use of negativePrompt parameter')).toBeInTheDocument()
})
