// apps/web/src/modules/Canvas/model/api.ts
// Typed /api/canvases calls + TanStack Query hooks. Query keys: ['canvases']
// (list) and ['canvas', id] (document). The document is loaded ONCE into the
// store (init) and autosaved back — the query cache is not the editing truth,
// so no invalidation churn while dragging nodes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Canvas,
  CanvasDetail,
  CanvasList,
  CanvasUploadResult,
  UpdateCanvasInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

export function useCanvases() {
  return useQuery({
    queryKey: ['canvases'],
    queryFn: () => api<CanvasList>('/api/canvases'),
  })
}

export function useCanvasDetail(canvasId: string) {
  return useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api<CanvasDetail>(`/api/canvases/${canvasId}`),
    // The store owns edits after load; a background refetch overwriting the
    // working doc would eat keystrokes.
    staleTime: Infinity,
  })
}

export function useCreateCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      api<Canvas>('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['canvases'] }),
  })
}

export function useDeleteCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (canvasId: string) =>
      api<undefined>(`/api/canvases/${canvasId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['canvases'] }),
  })
}

// Raw save used by the autosave loop (not a hook — called from the store side).
export function saveCanvas(canvasId: string, doc: UpdateCanvasInput) {
  return api<CanvasDetail>(`/api/canvases/${canvasId}`, {
    method: 'PATCH',
    body: JSON.stringify(doc),
  })
}

// Upload-node bytes. The server stores them and answers a '/media/…' path,
// which the caller writes into the node (setUploadUrl) so the next autosave
// persists it — the file itself never travels through the document.
export function uploadCanvasImage(canvasId: string, dataUri: string) {
  return api<CanvasUploadResult>(`/api/canvases/${canvasId}/uploads`, {
    method: 'POST',
    body: JSON.stringify({ dataUri }),
  })
}
