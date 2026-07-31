// apps/web/src/modules/Gallery/components/GenerationDetail.test.tsx
// Pins ONE thing: this sheet scrolls its own body. The MEDIA is already bounded
// (max-h-[70dvh], so it shrinks with the viewport), but the PROMPT under it is
// not — contracts allow 2000 characters, which wraps to far more height than the
// remaining panel. The kit Modal is a max-h-[92dvh] flex column whose children
// default to min-height:auto, so without the scroller a long prompt pushes the
// action rail past the panel bottom and the wheel scrolls the page behind the
// overlay (design.md §6 Modal law).
//
// READ-MOSTLY, so the actions scroll WITH the content (the Templates canon)
// rather than being pinned: this is a detail view, not a form, and its icon rail
// is a set of options rather than the one outcome the sheet exists for.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

it('scrolls its own body so a long prompt cannot push the actions off the sheet', () => {
  render(<GenerationDetail generation={GENERATION} isOpen onClose={vi.fn()} />, { wrapper })

  const scroller = screen.getByRole('dialog').querySelector('.overflow-y-auto')
  expect(scroller).not.toBeNull()
  // min-h-0 is the half that does the work — without it the flex child refuses
  // to shrink below its content and overflow-y-auto never engages.
  expect(scroller).toHaveClass('min-h-0')
})
