// apps/web/src/modules/Generator/model/mentions.ts
// The client half of the entity-mention protocol (server half: apps/api
// modules/entities/mentions.ts, contract: contracts/entity.ts).
//
// THE INVARIANT: entityRefs are DERIVED from the prompt text, never stored
// alongside it. The prompt holds opaque `[[e1]]` tokens; the mentions list maps
// each token to an entity. At submit we send only the refs whose token is still
// in the text — so deleting `[[e1]]` from the textarea drops the tag, with no
// separate "remove" bookkeeping to forget. One source of truth: the text.
import { ENTITY_PLACEHOLDER_PATTERN, entityPlaceholderToken } from '@opencreate/contracts'
import type { EntityRef } from '@opencreate/contracts'

// The next unused `eN` key. Scans for the lowest free index rather than
// incrementing a counter, so it survives tokens being removed and re-added.
export function nextPlaceholder(mentions: EntityRef[]): string {
  const used = new Set(mentions.map((mention) => mention.placeholder))
  let index = 1
  while (used.has(`e${index}`)) index += 1
  return `e${index}`
}

// The refs to actually send: a mention counts only if its token literally
// appears in the current prompt. A fresh RegExp per call — the shared constant
// carries /g (and thus mutable lastIndex), so reusing it across calls would make
// this stateful.
export function deriveEntityRefs(prompt: string, mentions: EntityRef[]): EntityRef[] {
  const present = new Set<string>()
  const pattern = new RegExp(ENTITY_PLACEHOLDER_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    if (match[1]) present.add(match[1])
  }
  return mentions.filter((mention) => present.has(mention.placeholder))
}

// Re-export so callers insert the token through ONE definition of the syntax
export { entityPlaceholderToken }
