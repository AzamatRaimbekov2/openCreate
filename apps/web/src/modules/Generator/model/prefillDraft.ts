// apps/web/src/modules/Generator/model/prefillDraft.ts
// "Regenerate": load a past generation back into the composer's draft so the
// user can tweak it and re-run.
//
// WHY IT LIVES HERE AND IS EXPORTED: the Gallery owns the card that offers the
// action, but it must never import the Generator's draft store — that is a
// cross-module import (architecture law). So the Generator publishes this hook,
// the ROUTE wires the two together, and Gallery stays ignorant of what
// "regenerating" even touches.
import { useGeneratorStore } from './generatorStore'

// The fields of a past generation the draft can absorb. Structurally a subset of
// Generation, so callers pass one straight in — but typed narrowly here so the
// Generator does not depend on the Gallery's DTO.
export type PrefillSource = {
  prompt: string
  modelId: string
  // aspectRatio is optional to match Generation.params exactly (the contract
  // marks it optional). Unused here anyway — setModel re-derives a valid ratio.
  params: { aspectRatio?: string | undefined; duration?: number | undefined }
}

export function usePrefillDraft() {
  const setPrompt = useGeneratorStore((store) => store.setPrompt)
  const setModel = useGeneratorStore((store) => store.setModel)
  const models = useGeneratorStore((store) => store.models)

  return (source: PrefillSource) => {
    setPrompt(source.prompt)
    // Only restore the model if the catalog still offers it. A retired model id
    // would otherwise put the store in a state where selectModel() returns
    // undefined and the composer silently refuses to submit — the prompt is the
    // part the user actually asked to bring back, so it lands regardless.
    if (models.some((model) => model.id === source.modelId)) {
      // setModel re-normalizes aspect/duration/image for the chosen model, which
      // is why we do NOT set aspectRatio ourselves: the store's own rules decide
      // whether the old ratio is still valid for that model.
      setModel(source.modelId)
    }
  }
}
