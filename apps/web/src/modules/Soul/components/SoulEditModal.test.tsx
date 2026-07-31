// apps/web/src/modules/Soul/components/SoulEditModal.test.tsx
// Pins ONE thing: this modal owns a scroller. It wraps the whole SoulConstructor
// (name + two required axes + eight optional selects + trait chips + notes +
// preview), which is comfortably the tallest body any modal in the app hands to
// the kit Modal — and the panel is a max-h-[92dvh] flex column whose children
// default to min-height:auto. Without the scroller the constructor paints past
// the panel bottom and the wheel scrolls the PAGE behind the overlay
// (design.md §6 Modal law; the StyleEditor case, found live at 1336×728).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Entity } from '@opencreate/contracts'
import { SoulEditModal } from './SoulEditModal'
import 'shared/config/i18n'

// The minimum an Entity needs to seed a soul draft; the constructor reads the
// soul and the name, nothing else on the row.
const ENTITY = {
  id: 'e1',
  kind: 'character',
  name: 'Мира',
  description: '',
  images: [],
  primaryImageId: null,
  soul: null,
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
} as unknown as Entity

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

it('scrolls its own body so the constructor never runs off the panel', () => {
  render(<SoulEditModal entity={ENTITY} isOpen onClose={vi.fn()} />, { wrapper })

  const scroller = screen.getByRole('dialog').querySelector('.overflow-y-auto')
  expect(scroller).not.toBeNull()
  // min-h-0 is the half that does the work: without it the flex child refuses to
  // shrink below its content and overflow-y-auto never engages.
  expect(scroller).toHaveClass('min-h-0')
})
