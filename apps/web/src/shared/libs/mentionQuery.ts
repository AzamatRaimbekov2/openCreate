// apps/web/src/shared/libs/mentionQuery.ts
// Pure caret math for a composer's INLINE "@" mention picker: given the prompt
// text and the caret offset, decide whether the caret sits inside an "@query"
// run, and how to splice the chosen token in. Kept side-effect-free (no DOM, no
// store) so the trigger rules are unit-testable in isolation — the component
// only wires these to the textarea's value + selectionStart.
//
// LIVES IN shared/, not in a module, for the same reason as mentions.ts: BOTH
// the /create composer (Generator) and the Cinema shot composer speak the "@"
// protocol, and modules may not import each other. Protocol plumbing over
// strings — no state, no domain logic.
//
// WHY the boundary rule: "@" must start the run (text start or right after
// whitespace) so an email's "user@host" never pops the picker, and there must be
// no whitespace between the "@" and the caret so a finished mention ("@bob and|")
// no longer counts. This mirrors how chat apps scope an @-mention to one word.
export type ActiveMention = { start: number; query: string }

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch)

// The "@query" the caret is currently inside, or null. Scans backward from the
// caret to the nearest "@" that opens a run; bails the moment it hits whitespace
// (the caret is past a closed mention) or finds an "@" glued to a preceding word.
export function findActiveMention(text: string, caret: number): ActiveMention | null {
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = text[i]
    if (ch === '@') {
      const atBoundary = i === 0 || isSpace(text[i - 1])
      return atBoundary ? { start: i, query: text.slice(i + 1, caret) } : null
    }
    if (isSpace(ch)) return null
  }
  return null
}

// Splice the token in place of the active "@query" span [start, caret). Appends a
// single trailing space so the user keeps typing after the tag, but never doubles
// a space when text already follows the caret.
export function applyMention(
  text: string,
  active: ActiveMention,
  caret: number,
  token: string,
): { text: string; caret: number } {
  const before = text.slice(0, active.start)
  const after = text.slice(caret)
  const trail = after.startsWith(' ') ? '' : ' '
  const insert = `${token}${trail}`
  return { text: `${before}${insert}${after}`, caret: active.start + insert.length }
}
