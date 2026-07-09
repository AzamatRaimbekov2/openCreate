// apps/api/src/modules/entities/mentions.ts
// Turns the CLIENT's prompt (which carries opaque `[[e1]]` tokens) into the
// prompt the MODEL sees (which carries the entity's name and description).
//
// This is the correctness core of the entity feature. If substitution is wrong,
// the user tags a character, pays credits, and receives a stranger — with no
// error anywhere. So this module is pure, exhaustively tested, and it THROWS
// rather than degrade: a raw `[[e1]]` reaching a text encoder is worse than a
// 400, because the 400 is free and the generation is not.
//
// ADR: docs/wiki/decisions/entity-library-reference-tagging.md
import { ENTITY_PLACEHOLDER_PATTERN } from '@opencreate/contracts'
import type { EntityRef } from '@opencreate/contracts'

// The slice of an entity that reaches the prompt. Not the full DTO: composition
// has no business seeing images, timestamps or ownership.
export type MentionEntity = {
  id: string
  name: string
  description: string
}

// Loaded entities keyed by id — the service resolves and authorizes them first
export type MentionEntities = Record<string, MentionEntity>

// How one entity reads inside a sentence. Name first (it is the subject the user
// wrote around), description parenthesised so it reads as an aside rather than
// hijacking the grammar of the surrounding prompt.
function renderMention(entity: MentionEntity): string {
  const description = entity.description.trim()
  return description ? `${entity.name} (${description})` : entity.name
}

export function composePrompt(
  prompt: string,
  refs: EntityRef[],
  entities: MentionEntities,
): string {
  // placeholder ("e1") → the text it becomes. Built up front so substitution is
  // a SINGLE pass; a sequential replace-per-ref loop would re-scan text it had
  // already written, letting an entity literally named "[[e2]]" become a
  // substitution target on the next iteration.
  const replacements = new Map<string, string>()
  for (const ref of refs) {
    const entity = entities[ref.entityId]
    if (!entity) {
      // The ref survived validation but the entity is gone or not ours. Refusing
      // is the only safe move: silently dropping it produces a prompt with a raw
      // token, and silently ignoring it produces a generation the user did not ask for.
      throw new Error(`unknown entity: ${ref.entityId}`)
    }
    replacements.set(ref.placeholder, renderMention(entity))
  }

  // One pass over the ORIGINAL string. Because String.replace's callback result
  // is never re-examined, nothing we write can be matched again.
  const unresolved: string[] = []
  const composed = prompt.replace(
    // A fresh RegExp: the shared constant has the /g flag, and a /g regex carries
    // mutable `lastIndex`. Reusing the exported object across calls would make
    // this function stateful — a bug that only appears on the second call.
    new RegExp(ENTITY_PLACEHOLDER_PATTERN.source, 'g'),
    (_match, placeholder: string) => {
      const replacement = replacements.get(placeholder)
      if (replacement === undefined) {
        unresolved.push(placeholder)
        return _match
      }
      return replacement
    },
  )

  if (unresolved.length > 0) {
    // A token the client wrote but never declared. Never let it through: the
    // encoder would read "[[e2]]" as words and quietly poison the image.
    throw new Error(`unresolved placeholder: ${unresolved.join(', ')}`)
  }

  return composed
}
