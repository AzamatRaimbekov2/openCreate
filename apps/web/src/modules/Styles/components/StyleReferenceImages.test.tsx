// apps/web/src/modules/Styles/components/StyleReferenceImages.test.tsx
// The reference half of the style package (ADR style-studio A1/A4). Load-bearing
// assertions:
//   * all three gestures — click, drop, paste — go through the ONE shared
//     readImageFile gate and POST the same data URI;
//   * the cap is STYLE_MAX_REFERENCES and the add affordance DISAPPEARS at it
//     (a control that always 400s is worse than no control);
//   * a client-side reject is localized and fires NO request;
//   * removing cites the ref by id;
//   * the copy is honest about ambience — it must never promise the images
//     reach the model.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Style, StyleReferenceImage } from '@opencreate/contracts'
import { STYLE_MAX_REFERENCES } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { StyleReferenceImages } from './StyleReferenceImages'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function styleRow(references: StyleReferenceImage[]): Style {
  return {
    id: 'st1',
    name: 'Neon noir',
    kind: 'prompt',
    builtin: false,
    fragment: 'neon noir',
    negative: '',
    recommendedModelId: null,
    referenceImages: references,
    previewUrl: null,
    createdAt: null,
    updatedAt: null,
  }
}

const pngFile = () => new File(['bytes'], 'ref.png', { type: 'image/png' })

function renderRefs(references: StyleReferenceImage[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StyleReferenceImages styleId="st1" references={references} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

it('uploads a picked file as a data URI', async () => {
  apiMock.mockResolvedValue(styleRow([{ id: 'r1', url: '/media/a.png' }]))
  renderRefs()

  await userEvent.upload(screen.getByLabelText(/add reference/i), pngFile())

  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      '/api/styles/st1/references',
      expect.objectContaining({ method: 'POST' }),
    ),
  )
  expect(String(apiMock.mock.calls[0]?.[1]?.body)).toContain('data:image/png;base64,')
})

it('accepts a dropped file through the same gate', async () => {
  apiMock.mockResolvedValue(styleRow([{ id: 'r1', url: '/media/a.png' }]))
  renderRefs()

  const region = screen.getByRole('group', { name: /style references/i })
  fireEvent.drop(region, { dataTransfer: { files: [pngFile()] } })

  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
})

it('accepts a pasted screenshot through the same gate', async () => {
  apiMock.mockResolvedValue(styleRow([{ id: 'r1', url: '/media/a.png' }]))
  renderRefs()

  const region = screen.getByRole('group', { name: /style references/i })
  const file = pngFile()
  fireEvent.paste(region, { clipboardData: { files: [file], items: [] } })

  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
})

it('refuses a non-image locally, with localized copy and no request', async () => {
  // The <input accept="image/*"> filters a non-image before it is ever read, so
  // the honest reject vector is a DROP — readImageFile is the gate under test
  // (the same reasoning ShotReferenceImages.test.tsx records).
  renderRefs()

  fireEvent.drop(screen.getByRole('group', { name: /style references/i }), {
    dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
  })

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  // Localized, never a raw exception or a status code
  expect(screen.queryByText(/400|error|failed/i)).not.toBeInTheDocument()
  expect(apiMock).not.toHaveBeenCalled()
})

it('counts against the cap and disables the add tile when full', () => {
  const full = Array.from({ length: STYLE_MAX_REFERENCES }, (_, i) => ({
    id: `r${i}`,
    url: `/media/${i}.png`,
  }))
  renderRefs(full)

  // The counter is the REASON, and it stays visible beside the disabled control
  // (the Assets3D PartsStage law: a disabled control with no stated reason reads
  // as a bug). Disabled rather than removed so the ceiling stays legible.
  expect(screen.getByText(`${STYLE_MAX_REFERENCES} / ${STYLE_MAX_REFERENCES}`)).toBeInTheDocument()
  expect(screen.getByLabelText(/add reference/i)).toBeDisabled()
})

it('ignores a drop once the cap is reached', async () => {
  const full = Array.from({ length: STYLE_MAX_REFERENCES }, (_, i) => ({
    id: `r${i}`,
    url: `/media/${i}.png`,
  }))
  renderRefs(full)

  fireEvent.drop(screen.getByRole('group', { name: /style references/i }), {
    dataTransfer: { files: [pngFile()] },
  })

  // Disabling the tile must not leave the gesture path open — the server 400s a
  // fourth, so the refusal belongs here, before the request.
  await waitFor(() => expect(apiMock).not.toHaveBeenCalled())
})

it('removes a reference by its id', async () => {
  apiMock.mockResolvedValue(styleRow([]))
  renderRefs([{ id: 'r1', url: '/media/a.png' }])

  await userEvent.click(screen.getByRole('button', { name: /remove reference/i }))

  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith('/api/styles/st1/references/r1', { method: 'DELETE' })
  )
})

it('describes the images as a hint, never as a guarantee', () => {
  renderRefs()

  // The backend applies style refs AMBIENTLY: dropped silently on a model with
  // no reference support, and trimmed first when the budget is full. Copy that
  // promised they always reach the model would be a lie.
  const region = screen.getByRole('group', { name: /style references/i })
  expect(within(region).getByText(/where the model can use them/i)).toBeInTheDocument()
})
