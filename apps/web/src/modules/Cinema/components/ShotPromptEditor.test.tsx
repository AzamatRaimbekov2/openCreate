// apps/web/src/modules/Cinema/components/ShotPromptEditor.test.tsx
// The rich prompt field: the WIRE value keeps opaque [[eN]] tokens, but the
// user sees each token as an inline chip (photo + name, amber). The load-
// bearing claims:
//   * a token renders as a chip (name + thumbnail), never as raw "[[e1]]";
//   * the DOM serializes BACK to the exact wire string (round-trip);
//   * removing a chip from the DOM reports a value without its token;
//   * unknown tokens (no matching chip) stay literal text — never invented.
import { fireEvent, render, screen } from '@testing-library/react'
import {
  ShotPromptEditor,
  parsePromptSegments,
  serializeEditor,
} from './ShotPromptEditor'
import type { PromptChip } from './ShotPromptEditor'
import 'shared/config/i18n'

const chips: PromptChip[] = [{ placeholder: 'e1', name: 'Fox', imageUrl: '/media/fox.png' }]

function renderEditor(value: string, onChange = vi.fn()) {
  render(
    <ShotPromptEditor
      value={value}
      chips={chips}
      onChange={onChange}
      placeholder="Describe the shot"
      ariaLabel="Prompt"
    />,
  )
  return { editor: screen.getByRole('textbox', { name: 'Prompt' }), onChange }
}

describe('parsePromptSegments', () => {
  it('splits text around known tokens into chip segments', () => {
    expect(parsePromptSegments('a cat [[e1]] runs', chips)).toEqual([
      { type: 'text', text: 'a cat ' },
      { type: 'chip', placeholder: 'e1', name: 'Fox', imageUrl: '/media/fox.png' },
      { type: 'text', text: ' runs' },
    ])
  })

  it('keeps an UNKNOWN token as literal text', () => {
    expect(parsePromptSegments('a [[e9]] cat', chips)).toEqual([
      { type: 'text', text: 'a [[e9]] cat' },
    ])
  })
})

describe('ShotPromptEditor', () => {
  it('renders a token as a chip with the name and thumbnail, not raw [[e1]]', () => {
    const { editor } = renderEditor('a cat [[e1]] runs')

    // The chip wears the character's name and photo
    expect(screen.getByText('Fox')).toBeInTheDocument()
    const img = editor.querySelector('img')
    expect(img).toHaveAttribute('src', '/media/fox.png')
    // The raw token is not shown to the user
    expect(editor.textContent).not.toContain('[[e1]]')
  })

  it('serializes the rendered DOM back to the exact wire string', () => {
    const { editor } = renderEditor('a cat [[e1]] runs')
    expect(serializeEditor(editor)).toBe('a cat [[e1]] runs')
  })

  it('reports a value without the token when its chip is removed from the DOM', () => {
    const { editor, onChange } = renderEditor('a cat [[e1]] runs')

    // Simulate the browser's atomic chip deletion (Backspace over a
    // contentEditable=false island removes the whole element), then the input
    // event the browser fires after it.
    editor.querySelector('[data-placeholder="e1"]')?.remove()
    fireEvent.input(editor)

    expect(onChange).toHaveBeenCalledWith('a cat  runs', expect.any(Number))
  })

  it('reports typed text through onChange with the caret offset', () => {
    const { editor, onChange } = renderEditor('')

    editor.append(document.createTextNode('hello'))
    fireEvent.input(editor)

    expect(onChange).toHaveBeenCalledWith('hello', expect.any(Number))
  })
})
