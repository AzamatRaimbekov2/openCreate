// One transcript entry, four shapes. What is pinned here is the contract of the
// chat's copy and its ONE money button:
//   * a status is never colour-only — the word "done"/"error" is in the DOM;
//   * a plan itemizes every charge and restates the total ON the confirm button;
//   * a plan that is no longer the gate cannot be clicked;
//   * a stale plan explains itself and points at the way out;
//   * a result links to the artifacts the agent actually made;
//   * a sanitized SERVER failure is shown in the user's language, never as the
//     English sentence the API wrote into the transcript.
// Rendered inside a tiny real router (the CinemaLibrary harness) because the
// artifact links are typed <Link>s — so every first query is an async findBy.
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CreatorMessage, CreatorMessageContent } from '@opencreate/contracts'
import { MessageCard } from './MessageCard'
import type { MessageCardProps } from './MessageCard'
import 'shared/config/i18n'

const message = (role: CreatorMessage['role'], content: CreatorMessageContent): CreatorMessage => ({
  id: 'm1',
  role,
  content,
  createdAt: '2026-07-30T10:00:00.000Z',
})

function renderCard(props: Partial<MessageCardProps> & Pick<MessageCardProps, 'message'>) {
  const onConfirm = props.onConfirm ?? vi.fn()
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ul>
        <MessageCard planState="live" isConfirming={false} {...props} onConfirm={onConfirm} />
      </ul>
    ),
  })
  const canvasStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/canvas/$canvasId',
    component: () => null,
  })
  const soulStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul/$entityId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, canvasStub, soulStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return { onConfirm }
}

describe('MessageCard — text', () => {
  it('shows the user’s own request', async () => {
    renderCard({ message: message('user', { kind: 'text', text: 'собери холст с лисом' }) })
    expect(await screen.findByText('собери холст с лисом')).toBeInTheDocument()
  })

  it('shows the agent’s prose as written — it already speaks the user’s language', async () => {
    renderCard({ message: message('assistant', { kind: 'text', text: 'Готово, холст собран.' }) })
    expect(await screen.findByText('Готово, холст собран.')).toBeInTheDocument()
  })

  it('replaces a sanitized SERVER failure with localized copy', async () => {
    // The API writes this English literal into the transcript when every brain
    // is down. frontend-error-ux: never an untranslated backend string as copy.
    renderCard({
      message: message('assistant', {
        kind: 'text',
        text: 'The creator agent is temporarily unavailable',
      }),
    })
    expect(await screen.findByText(/temporarily unavailable\. Try again/i)).toBeInTheDocument()
    expect(
      screen.queryByText('The creator agent is temporarily unavailable'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/nothing was charged/i)).toBeInTheDocument()
  })
})

describe('MessageCard — step', () => {
  it('names what the agent did, says "done" in words, and shows the price', async () => {
    renderCard({
      message: message('assistant', {
        kind: 'step',
        tool: 'start_generation',
        title: 'Портрет лиса',
        status: 'done',
        costCredits: 2,
      }),
    })
    expect(await screen.findByText('Портрет лиса')).toBeInTheDocument()
    // The word carries the meaning; the colour only reinforces it (a11y law)
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByText('2 cr')).toBeInTheDocument()
  })

  it('says "error" in words on a failed step', async () => {
    renderCard({
      message: message('assistant', {
        kind: 'step',
        tool: 'create_entity',
        title: 'Персонаж',
        status: 'error',
        detail: 'name is required',
      }),
    })
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('shows no price row for a free step (0 is a price, undefined is not)', async () => {
    renderCard({
      message: message('assistant', {
        kind: 'step',
        tool: 'list_models',
        title: 'Смотрю каталог',
        status: 'done',
      }),
    })
    expect(await screen.findByText('Смотрю каталог')).toBeInTheDocument()
    expect(screen.queryByText(/\bcr\b/)).not.toBeInTheDocument()
  })
})

const PLAN: CreatorMessageContent = {
  kind: 'plan',
  summary: 'Один портрет и один клип',
  items: [
    { label: 'портрет · flux dev', credits: 2 },
    { label: 'клип 5с · pixverse', credits: 35 },
  ],
  totalCredits: 37,
}

describe('MessageCard — plan (the budget gate)', () => {
  it('itemizes every charge with its price', async () => {
    renderCard({ message: message('assistant', PLAN) })
    expect(await screen.findByText('портрет · flux dev')).toBeInTheDocument()
    expect(screen.getByText('2 cr')).toBeInTheDocument()
    expect(screen.getByText('клип 5с · pixverse')).toBeInTheDocument()
    expect(screen.getByText('35 cr')).toBeInTheDocument()
  })

  it('restates the total ON the confirm button, where the click is aimed', async () => {
    const { onConfirm } = renderCard({ message: message('assistant', PLAN) })
    await userEvent.click(await screen.findByRole('button', { name: /37 cr/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cannot be confirmed once the plan is no longer the gate', async () => {
    const { onConfirm } = renderCard({ message: message('assistant', PLAN), planState: 'answered' })
    const button = await screen.findByRole('button', { name: /37 cr/ })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('explains a stale plan and points at the way out', async () => {
    renderCard({ message: message('assistant', PLAN), planState: 'stale' })
    expect(await screen.findByRole('button', { name: /37 cr/ })).toBeDisabled()
    expect(screen.getByText(/out of date/i)).toBeInTheDocument()
  })

  it('blocks a double confirm while the first one is in flight', async () => {
    renderCard({ message: message('assistant', PLAN), isConfirming: true })
    expect(await screen.findByRole('button', { name: /37 cr/ })).toBeDisabled()
  })
})

describe('MessageCard — result', () => {
  it('links to the board and to the character the agent made', async () => {
    renderCard({
      message: message('assistant', {
        kind: 'result',
        text: 'Собрал холст и персонажа.',
        canvasId: 'cv1',
        entityId: 'ent1',
      }),
    })
    expect(await screen.findByRole('link', { name: /board/i })).toHaveAttribute(
      'href',
      '/canvas/cv1',
    )
    expect(screen.getByRole('link', { name: /character/i })).toHaveAttribute('href', '/soul/ent1')
  })

  it('offers no dead links when the turn produced no artifacts', async () => {
    renderCard({
      message: message('assistant', { kind: 'result', text: 'Ничего создавать не понадобилось.' }),
    })
    expect(await screen.findByText('Ничего создавать не понадобилось.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
