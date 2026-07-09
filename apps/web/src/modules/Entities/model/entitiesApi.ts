// apps/web/src/modules/Entities/model/entitiesApi.ts
// TanStack Query layer for the entity library. One query key (['entities']) and
// a mutation per write, each invalidating that key so the library, the composer
// mention picker, and any open detail stay in lockstep — a stale entity list is
// how a user tags a character they just deleted.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AddEntityImageInput,
  CreateEntityInput,
  Entity,
  EntityList,
  UpdateEntityInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

const ENTITIES_KEY = ['entities'] as const

export function useEntities() {
  return useQuery({
    queryKey: ENTITIES_KEY,
    queryFn: () => api<EntityList>('/api/entities'),
  })
}

export function useCreateEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEntityInput) =>
      api<Entity>('/api/entities', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  })
}

export function useUpdateEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEntityInput }) =>
      api<Entity>(`/api/entities/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  })
}

export function useDeleteEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    // 204 No Content — the api helper tolerates an empty body
    mutationFn: (id: string) => api<void>(`/api/entities/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  })
}

export function useAddEntityImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddEntityImageInput }) =>
      api<Entity>(`/api/entities/${id}/images`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  })
}
