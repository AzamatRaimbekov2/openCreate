// apps/web/src/modules/Cinema/model/makeCharacterApi.ts
// Bridge an ATTACHED shot reference into the entity library as a named character,
// so a one-off "make it look like this" picture becomes a reusable, @-mentionable
// subject WITHOUT a new endpoint or a backend change. Cinema cannot import
// modules/Entities (the cross-module law), so this hook talks to the same
// /api/entities the library uses directly and invalidates the SHARED ['entities']
// cache — the key the composer's mention picker and the library both read — so
// the new character appears the instant it is created (exactly how the sibling
// galleryImagesApi reaches /api/generations without importing modules/Gallery).
//
// TWO writes chained in the mutationFn, because a character with no photo is not
// a reference: (1) create the character shell, then (2) fetch the reference bytes
// and POST them as the character's image. The image POST AUTO-SETS primaryImageId
// server-side when the entity has no primary yet, so there is no third PATCH —
// the returned Entity already carries its reference photo.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Entity } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { blobToDataUri } from 'shared/libs/blobToDataUri'

// The shared library cache key — declared here (NOT imported from
// modules/Entities, the cross-module law) so this hook stays module-local while
// still writing the ONE list the whole app reads. Kept in lockstep with
// modules/Entities' ENTITIES_KEY.
const ENTITIES_KEY = ['entities'] as const

export function useMakeCharacterFromReference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      imageUrl,
    }: {
      name: string
      imageUrl: string
    }): Promise<Entity> => {
      // 1. The character shell — an empty description: the reference IS the spec,
      //    and the user can flesh it out later in the library / Soul Studio.
      const entity = await api<Entity>('/api/entities', {
        method: 'POST',
        body: JSON.stringify({ kind: 'character', name: name.trim(), description: '' }),
      })
      // 2. Its reference photo: pull the /media bytes we already own, read them
      //    into a data URI, and POST as an upload. The server sets this as the
      //    entity's primary (its first image), so the character is immediately a
      //    usable reference — no follow-up PATCH.
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error(`media fetch ${response.status}`)
      const dataUri = await blobToDataUri(await response.blob())
      return api<Entity>(`/api/entities/${entity.id}/images`, {
        method: 'POST',
        body: JSON.stringify({ source: 'upload', dataUri }),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  })
}
