// apps/web/src/modules/Cinema/components/PresetPickers.test.tsx
// The style axis after the registry migration (ADR style-studio D5). The other
// three axes are still closed enums over bundled tables and are covered by
// presetOptions.test.ts; what is new here is that STYLE comes from an async
// registry handed down as a prop. Load-bearing assertions:
//   * a style the user wrote in the Style Studio is selectable in the shot
//     inspector — that is the whole point of the migration;
//   * a builtin keeps its translated label even though the server sends a
//     Russian one;
//   * before the registry lands the picker still offers the bundled builtins,
//     because a style choice must never disappear while a request is in flight.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Style } from '@opencreate/contracts'
import { PresetPickers } from './PresetPickers'
import type { PresetDraft } from '../model/presetOptions'
import 'shared/config/i18n'

const DRAFT: PresetDraft = {
  styleId: '',
  cameraShot: 'none',
  cameraMotion: 'none',
  quality: 'none',
}

function style(overrides: Partial<Style> & Pick<Style, 'id'>): Style {
  return {
    name: 'Untitled',
    kind: 'prompt',
    builtin: false,
    fragment: '',
    negative: '',
    recommendedModelId: null,
    previewUrl: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

async function openStylePicker(styles: Style[]) {
  render(<PresetPickers value={DRAFT} onChange={vi.fn()} styles={styles} />)
  await userEvent.click(screen.getByRole('button', { name: /style/i }))
  return screen.getByRole('listbox', { name: /style/i })
}

it('offers a style the user wrote, alongside the builtins', async () => {
  await openStylePicker([
    style({ id: 'anime', name: 'Аниме', builtin: true }),
    style({ id: 'uuid-1', name: 'Neon noir' }),
  ])

  expect(screen.getByRole('option', { name: 'Neon noir' })).toBeInTheDocument()
  // The builtin keeps the SPA's copy, not the server's Russian row
  expect(screen.getByRole('option', { name: 'Anime' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Аниме' })).not.toBeInTheDocument()
})

it('still offers the bundled builtins while the registry is in flight', async () => {
  await openStylePicker([])

  expect(screen.getByRole('option', { name: 'Anime' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Cinematic' })).toBeInTheDocument()
})

it('keeps the no-style sentinel — a shot may legitimately have no style', async () => {
  await openStylePicker([style({ id: 'uuid-1', name: 'Neon noir' })])

  expect(screen.getByRole('option', { name: /no style/i })).toBeInTheDocument()
})

it('reports the picked style id upward', async () => {
  const onChange = vi.fn()
  render(
    <PresetPickers
      value={DRAFT}
      onChange={onChange}
      styles={[style({ id: 'uuid-1', name: 'Neon noir' })]}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: /style/i }))
  await userEvent.click(screen.getByRole('option', { name: 'Neon noir' }))

  expect(onChange).toHaveBeenCalledWith({ styleId: 'uuid-1' })
})
