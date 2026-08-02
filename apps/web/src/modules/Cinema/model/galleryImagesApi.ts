// apps/web/src/modules/Cinema/model/galleryImagesApi.ts
// Read-only view of the signed-in user's OWN finished images, for the shot
// reference picker ("attach from gallery"). One flat query hitting the same
// GET /api/generations the Gallery module uses — but Cinema CANNOT import from
// modules/Gallery (the cross-module law), so we mirror the wire SHAPE
// (GenerationList) here and keep this hook self-contained. No infinite scroll:
// the picker shows the most recent page and that is deliberate — a reference
// board is a quick grab, not a full archive browse.
import { useQuery } from '@tanstack/react-query'
import type { GenerationList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Exactly what the picker tile needs — a stable id (list key) and a src URL.
// Kept narrow on purpose so the picker never leaks the full Generation shape.
export type GalleryImage = {
  // Generation id — the React list key, not shown to the user
  id: string
  // The /media URL the tile renders and the parent re-fetches on pick
  url: string
}

// One page of the user's generations (the API caps limit at 50). Its own cache
// key, separate from the Gallery module's ['generations'] infinite key, so this
// lightweight list never collides with the paginated one.
export function useMyImageGenerations() {
  return useQuery({
    queryKey: ['cinema', 'gallery-images'],
    queryFn: () => api<GenerationList>('/api/generations?limit=50'),
    // Flatten to the succeeded IMAGE generations that actually have a usable
    // media URL. flatMap (not filter+map) so the first-url extraction stays
    // airtight under noUncheckedIndexedAccess — a row with an empty mediaUrls
    // is dropped, never turned into an `undefined` src.
    select: (list): GalleryImage[] =>
      list.items.flatMap((generation) => {
        const url = generation.mediaUrls[0]
        return generation.type === 'image' && generation.status === 'succeeded' && url
          ? [{ id: generation.id, url }]
          : []
      }),
    // The user's own finished images change slowly relative to a picker open —
    // 30s keeps a re-open instant without serving truly stale results.
    staleTime: 30_000,
  })
}
