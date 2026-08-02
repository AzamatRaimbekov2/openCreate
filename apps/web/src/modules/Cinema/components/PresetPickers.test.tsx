// apps/web/src/modules/Cinema/components/PresetPickers.test.tsx
// The shot's LOOK controls. Two things are load-bearing here:
//
// 1. STYLE comes from an async registry handed down as a prop (ADR style-studio
//    D5) — a style the user wrote in the Style Studio must be selectable, a
//    builtin must keep its translated label even though the server sends a
//    Russian one, and the bundled builtins must still be offered while the
//    request is in flight (a style choice may never disappear mid-flight).
// 2. Since 2026-08-02 style and the new PER-SHOT ASPECT are ICON+TOOLTIP menu
//    chips, not labelled Selects (owner request). The icon is the whole trigger,
//    so the accessible name and the hover tooltip carry the meaning — that is
//    what these tests pin: the control is still findable and operable by name.
//
// The other three axes are closed enums over bundled tables, covered by
// presetOptions.test.ts.
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
    referenceImages: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function renderPickers(
  props: Partial<React.ComponentProps<typeof PresetPickers>> = {},
): React.ComponentProps<typeof PresetPickers> {
  const resolved: React.ComponentProps<typeof PresetPickers> = {
    value: DRAFT,
    onChange: vi.fn(),
    styles: [],
    aspectRatio: null,
    onAspectRatioChange: vi.fn(),
    ...props,
  }
  render(<PresetPickers {...resolved} />)
  return resolved
}

async function openStyleMenu(styles: Style[]) {
  renderPickers({ styles })
  await userEvent.click(screen.getByRole('button', { name: /^style$/i }))
  return screen.getByRole('menu', { name: /^style$/i })
}

describe('style axis (registry-backed icon menu)', () => {
  it('offers a style the user wrote, alongside the builtins', async () => {
    await openStyleMenu([
      style({ id: 'anime', name: 'Аниме', builtin: true }),
      style({ id: 'uuid-1', name: 'Neon noir' }),
    ])

    expect(screen.getByRole('menuitem', { name: 'Neon noir' })).toBeInTheDocument()
    // The builtin keeps the SPA's copy, not the server's Russian row
    expect(screen.getByRole('menuitem', { name: 'Anime' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Аниме' })).not.toBeInTheDocument()
  })

  it('still offers the bundled builtins while the registry is in flight', async () => {
    await openStyleMenu([])

    expect(screen.getByRole('menuitem', { name: 'Anime' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cinematic' })).toBeInTheDocument()
  })

  it('keeps the no-style sentinel — a shot may legitimately have no style', async () => {
    await openStyleMenu([style({ id: 'uuid-1', name: 'Neon noir' })])

    expect(screen.getByRole('menuitem', { name: /no style/i })).toBeInTheDocument()
  })

  it('reports the picked style id upward', async () => {
    const { onChange } = renderPickers({ styles: [style({ id: 'uuid-1', name: 'Neon noir' })] })

    await userEvent.click(screen.getByRole('button', { name: /^style$/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Neon noir' }))

    expect(onChange).toHaveBeenCalledWith({ styleId: 'uuid-1' })
  })

  // The trigger is an ICON — nothing on it spells out what it does, so the hover
  // tooltip has to. Without it the control is a mystery glyph.
  it('explains itself on hover: the tooltip says what a style is', () => {
    renderPickers()
    expect(screen.getByRole('button', { name: /^style$/i })).toHaveAttribute(
      'title',
      expect.stringMatching(/visual preset/i),
    )
  })
})

describe('per-shot aspect ratio', () => {
  it('offers the film-inherited default plus every ratio', async () => {
    renderPickers()
    await userEvent.click(screen.getByRole('button', { name: /shot aspect ratio/i }))

    expect(screen.getByRole('menuitem', { name: /same as film/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '16:9' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '1:1' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '9:16' })).toBeInTheDocument()
  })

  it('reports the picked ratio upward', async () => {
    const { onAspectRatioChange } = renderPickers()

    await userEvent.click(screen.getByRole('button', { name: /shot aspect ratio/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: '9:16' }))

    expect(onAspectRatioChange).toHaveBeenCalledWith('9:16')
  })

  // null is a real, meaningful value here: "no opinion, inherit the film canvas"
  it('clears the override back to the film canvas', async () => {
    const { onAspectRatioChange } = renderPickers({ aspectRatio: '9:16' })

    await userEvent.click(screen.getByRole('button', { name: /shot aspect ratio/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /same as film/i }))

    expect(onAspectRatioChange).toHaveBeenCalledWith(null)
  })

  // Icon-only trigger → the tooltip is the ONLY place the current value is
  // spelled out, so it must carry both the explanation and the live value.
  it('names the current value in its tooltip', () => {
    renderPickers({ aspectRatio: '9:16' })
    expect(screen.getByRole('button', { name: /shot aspect ratio/i })).toHaveAttribute(
      'title',
      expect.stringContaining('9:16'),
    )
  })

  it('says it follows the film when there is no override', () => {
    renderPickers({ aspectRatio: null })
    expect(screen.getByRole('button', { name: /shot aspect ratio/i })).toHaveAttribute(
      'title',
      expect.stringMatching(/same as film/i),
    )
  })
})
