// apps/web/src/modules/Cinema/components/ShotPromptEditor.tsx
// The shot prompt as the user should SEE it: prose with the cast rendered as
// inline chips (photo + name), while the value on the wire keeps the opaque
// `[[eN]]` tokens the API substitutes.
//
// WHY a contentEditable instead of the plain <textarea> it is built to replace:
// a textarea can only show one string, so the user reads `a fox [[e1]] runs` —
// machine syntax leaking into the thing she is composing. Worse, she can edit
// the token's insides (`[[e11]]`) and silently un-tag a character she is paying
// to keep consistent. A chip is an ATOMIC island (`contentEditable=false`), so
// the browser's own Backspace deletes it whole or not at all.
//
// THE INVARIANT, unchanged from the textarea (shared/libs/mentions.ts): the TEXT
// is the single source of truth for which tags are live. Deleting a chip deletes
// the token from the value, which drops the ref at submit — no bookkeeping.
//
// The DOM is written IMPERATIVELY (see the layout effect) rather than as React
// children: React must not own children it does not control, and the user's
// keystrokes mutate this subtree directly. Repainting on every keystroke would
// also throw the caret back to offset 0.
import { useLayoutEffect, useRef } from 'react'
import { ENTITY_PLACEHOLDER_PATTERN, entityPlaceholderToken } from '@opencreate/contracts'

// A character the prompt may mention: the token key plus what the chip wears.
export type PromptChip = {
  // The `e1` inside `[[e1]]`
  placeholder: string
  // Display name — what replaces the raw token on screen
  name: string
  // The character's reference photo
  imageUrl: string
}

// A prompt cut into what the editor renders: literal prose, or a chip island.
export type PromptSegment = { type: 'text'; text: string } | ({ type: 'chip' } & PromptChip)

// Amber marks a bound reference — same language as ShotCastField and the model
// picker, so a chip in the text reads as "this is the tagged character".
const CHIP_CLASS =
  'mx-0.5 inline-flex select-none items-center gap-1 rounded-full border border-glow-amber/40 bg-white/5 px-1.5 py-0.5 align-middle text-xs text-mist'

// Wire string → what to render. A token with NO matching chip stays literal
// text: inventing a chip for `[[e9]]` would show the user a character that the
// API will not substitute, and dropping it would silently edit her prompt.
export function parsePromptSegments(value: string, chips: readonly PromptChip[]): PromptSegment[] {
  const byPlaceholder = new Map(chips.map((chip) => [chip.placeholder, chip]))
  const segments: PromptSegment[] = []
  // A fresh RegExp per call — the shared constant carries /g (and thus a mutable
  // lastIndex), so reusing it across calls would make this stateful.
  const pattern = new RegExp(ENTITY_PLACEHOLDER_PATTERN.source, 'g')

  // Prose accumulates here so an unknown token merges with the text around it
  // into ONE segment instead of splitting the line into three.
  let pending = ''
  let consumed = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    // Group 1 is the `e1` key. Typed optional (noUncheckedIndexedAccess), and a
    // token with no chip behind it is skipped anyway — same branch either way.
    const key = match[1]
    const chip = key === undefined ? undefined : byPlaceholder.get(key)
    if (chip === undefined) continue
    pending += value.slice(consumed, match.index)
    if (pending !== '') segments.push({ type: 'text', text: pending })
    pending = ''
    segments.push({ type: 'chip', ...chip })
    consumed = match.index + match[0].length
  }

  pending += value.slice(consumed)
  if (pending !== '') segments.push({ type: 'text', text: pending })
  return segments
}

// What the DOM is worth on the wire: text nodes verbatim, each chip island back
// as its `[[eN]]` token. This is the round-trip half of parsePromptSegments and
// the ONLY place the editor's value comes from — so a chip the browser deleted
// atomically simply stops contributing its token, with nothing to keep in sync.
export function serializeEditor(root: Node): string {
  let out = ''

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const placeholder = element.getAttribute('data-placeholder')
      if (placeholder !== null) {
        out += entityPlaceholderToken(placeholder)
        return
      }
      // contentEditable emits <br> for Enter; without this a two-line prompt
      // would reach the provider as one run-on line.
      if (element.tagName === 'BR') {
        out += '\n'
        return
      }
    }
    node.childNodes.forEach(walk)
  }

  root.childNodes.forEach(walk)
  return out
}

// Where the caret sits IN WIRE COORDINATES — the offset the "@" mention math
// needs, counted over `[[eN]]` tokens rather than over rendered chip labels.
// Falls back to end-of-value when there is no live selection (fresh mount, or
// programmatic input), which is where a caret lands anyway.
function caretOffset(root: HTMLElement): number {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) return serializeEditor(root).length

  const range = selection.getRangeAt(0)
  if (!root.contains(range.endContainer)) return serializeEditor(root).length

  const upToCaret = range.cloneRange()
  upToCaret.selectNodeContents(root)
  upToCaret.setEnd(range.endContainer, range.endOffset)
  return serializeEditor(upToCaret.cloneContents()).length
}

// Paint `segments` into the editor. Chips carry the placeholder in a data
// attribute — never in their text — so the raw token is invisible to the user
// but recoverable by serializeEditor.
function paint(root: HTMLElement, segments: PromptSegment[]): void {
  root.replaceChildren(
    ...segments.map((segment) => {
      if (segment.type === 'text') return root.ownerDocument.createTextNode(segment.text)

      const chip = root.ownerDocument.createElement('span')
      chip.dataset.placeholder = segment.placeholder
      // The island: the browser treats it as one indivisible character, so the
      // user can never edit a token into a half-valid `[[e1`.
      chip.contentEditable = 'false'
      chip.className = CHIP_CLASS

      const photo = root.ownerDocument.createElement('img')
      photo.src = segment.imageUrl
      // Decorative: the name sits right beside it, so a second announcement
      // would just make a screen reader say the character twice.
      photo.alt = ''
      photo.className = 'h-4 w-4 rounded-full object-cover'

      chip.append(photo, root.ownerDocument.createTextNode(segment.name))
      return chip
    }),
  )
}

export type ShotPromptEditorProps = {
  // The prompt ON THE WIRE, tokens and all
  value: string
  // Characters whose tokens should render as chips. A token without a chip here
  // stays literal text.
  chips: readonly PromptChip[]
  // The new wire value plus the caret offset within it
  onChange: (value: string, caret: number) => void
  // Shown while the prompt is empty (contentEditable has no native placeholder)
  placeholder: string
  // Accessible name — this is a textbox with no visible label
  ariaLabel: string
  // Caller-supplied surface styling (the field owns no chrome of its own)
  className?: string
}

export function ShotPromptEditor({
  value,
  chips,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: ShotPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  // What the last paint was keyed on, so a chip list that arrives LATE (entities
  // load after the shot) still turns an already-rendered literal token into a
  // chip, even though the value itself never changed.
  const paintedChipsRef = useRef<string | null>(null)
  const chipKey = chips.map((chip) => `${chip.placeholder}:${chip.name}:${chip.imageUrl}`).join('|')

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    // Repaint ONLY when the DOM would say something other than `value` (an edit
    // from outside: enhance, a spliced token, a loaded shot) or when the chips
    // changed. Repainting mid-typing would reset the caret on every keystroke.
    if (serializeEditor(editor) === value && paintedChipsRef.current === chipKey) return
    paintedChipsRef.current = chipKey
    paint(editor, parsePromptSegments(value, chips))
  }, [value, chips, chipKey])

  return (
    <div className="relative h-full w-full">
      {value === '' ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 text-sm text-mist-dim/60"
        >
          {placeholder}
        </span>
      ) : null}
      <div
        ref={editorRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable
        tabIndex={0}
        onInput={(event) => {
          const editor = event.currentTarget
          onChange(serializeEditor(editor), caretOffset(editor))
        }}
        className={className}
      />
    </div>
  )
}
