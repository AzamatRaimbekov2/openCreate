// apps/web/src/modules/Entities/components/EntityEditor.test.tsx
// Pins ONE thing: this modal scrolls its fields and pins its actions. In EDIT
// mode the body is name + description textarea + preset chips + the photo grid
// (which WRAPS, so it grows with the number of photos) — measured past the
// panel's usable height at a 728px viewport. The kit Modal is a max-h-[92dvh]
// flex column whose children default to min-height:auto, so without the scroller
// the form paints past the bottom, the wheel scrolls the PAGE behind the overlay,
// and Save goes out of reach (design.md §6 Modal law; the StyleEditor case).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Entity } from '@opencreate/contracts'
import { EntityEditor } from './EntityEditor'
import 'shared/config/i18n'

const ENTITY = {
  id: 'e1',
  kind: 'character',
  name: 'Мира',
  description: 'a courier',
  images: [
    { id: 'i1', url: '/media/1.png' },
    { id: 'i2', url: '/media/2.png' },
  ],
  primaryImageId: 'i1',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
} as unknown as Entity

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

it('scrolls the fields and keeps the actions reachable', () => {
  render(<EntityEditor entity={ENTITY} isOpen onClose={vi.fn()} />, { wrapper })

  const scroller = screen.getByRole('dialog').querySelector('.overflow-y-auto')
  expect(scroller).not.toBeNull()
  // min-h-0 is the half that does the work — without it the flex child refuses
  // to shrink below its content and overflow-y-auto never engages.
  expect(scroller).toHaveClass('min-h-0')
  // The actions live OUTSIDE the scroller: a photo grid that grows must not be
  // able to push Save past the panel bottom.
  expect(scroller?.contains(screen.getByRole('button', { name: /done/i }))).toBe(false)
})
