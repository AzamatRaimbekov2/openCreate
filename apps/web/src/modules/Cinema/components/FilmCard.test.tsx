// apps/web/src/modules/Cinema/components/FilmCard.test.tsx
// The card's media plate has two states now that a film can carry a cover
// (owner request 2026-07-31): the picture when there is one, the quiet glyph
// when there is not. Pinned because "no cover art to show yet" was baked into
// this component as an assumption, and an assumption that stops being true is
// exactly what a test should catch.
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import type { Film } from '@opencreate/contracts'
import { FilmCard } from './FilmCard'
import 'shared/config/i18n'

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'film1',
    title: 'Neon Drift',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    coverUrl: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    updatedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

// FilmCard is a typed <Link>, so it needs a router with the editor route.
function renderCard(film: Film) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <FilmCard film={film} />,
  })
  const editorStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema/$filmId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, editorStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

it('shows the cover in the media plate when the film has one', async () => {
  renderCard(makeFilm({ coverUrl: '/media/cover.png' }))

  const cover = await screen.findByRole('img', { name: /neon drift/i })
  expect(cover).toHaveAttribute('src', '/media/cover.png')
})

it('falls back to the quiet glyph when the film has no cover', async () => {
  renderCard(makeFilm({ coverUrl: null }))

  await screen.findByText('Neon Drift')
  // No image at all rather than a broken one — the plate keeps its shape and
  // carries the film glyph instead.
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
