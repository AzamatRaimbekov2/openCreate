// apps/web/src/modules/Generator/model/generatorStore.ts
// Zustand store of the Generator module: the user's current generation draft
// (type, model, prompt, aspect, duration, i2v image) plus the normalization
// rules that keep the draft valid for whatever model is selected. Pricing is
// never duplicated here — the selectors read it from the catalog models that
// setCatalog stored (single source: the API catalog).
import { create } from 'zustand'
import type { AspectRatio, CatalogModel, CreateGenerationInput } from '@opencreate/contracts'

export type GeneratorState = {
  // Catalog models as fetched from /api/catalog (set once by the panel)
  models: CatalogModel[]
  // What the user is creating — drives which model cards are offered
  type: CatalogModel['type']
  // Selected catalog model id; null until the catalog arrives
  modelId: string | null
  // Free-text prompt (raw, untrimmed — trimming happens in selectCreateInput)
  prompt: string
  // Selected aspect ratio — always one the selected model supports
  aspectRatio: AspectRatio
  // Video duration in seconds; undefined for image models
  duration: number | undefined
  // i2v reference image as a data URI; null when absent or unsupported
  inputImage: string | null
  // Actions
  setCatalog: (models: CatalogModel[]) => void
  setType: (type: CatalogModel['type']) => void
  setModel: (modelId: string) => void
  setPrompt: (prompt: string) => void
  setAspectRatio: (aspectRatio: AspectRatio) => void
  setDuration: (duration: number) => void
  setInputImage: (inputImage: string | null) => void
}

// The slice of state a model switch has to re-validate
type DraftSlice = Pick<GeneratorState, 'aspectRatio' | 'duration' | 'inputImage'>

// Normalize the draft for a newly selected model: keep the user's choices when
// the model supports them, otherwise fall to the model's first option; drop
// the i2v image entirely when the model cannot take one.
function normalizeFor(model: CatalogModel, draft: DraftSlice) {
  const aspectRatio =
    model.aspectRatios.find((ratio) => ratio === draft.aspectRatio) ??
    model.aspectRatios[0] ??
    draft.aspectRatio
  const duration =
    model.type === 'video'
      ? draft.duration !== undefined && model.durationOptions.includes(draft.duration)
        ? draft.duration
        : model.durationOptions[0]
      : undefined
  const inputImage = model.supportsImageInput ? draft.inputImage : null
  return { type: model.type, modelId: model.id, aspectRatio, duration, inputImage }
}

export const useGeneratorStore = create<GeneratorState>()((set, get) => ({
  models: [],
  type: 'image',
  modelId: null,
  prompt: '',
  aspectRatio: '1:1',
  duration: undefined,
  inputImage: null,

  setCatalog: (models) => {
    const state = get()
    const selected = models.find((model) => model.id === state.modelId)
    // Keep a still-valid selection; otherwise select the first model of the
    // current type (fall back to any model so the panel is never empty-handed)
    const next = selected ?? models.find((model) => model.type === state.type) ?? models[0]
    set(next ? { models, ...normalizeFor(next, state) } : { models })
  },

  setType: (type) => {
    const state = get()
    const first = state.models.find((model) => model.type === type)
    // No model of that type in the catalog — remember the intent anyway
    set(first ? normalizeFor(first, state) : { type })
  },

  setModel: (modelId) => {
    const state = get()
    const model = state.models.find((candidate) => candidate.id === modelId)
    if (!model) return
    set(normalizeFor(model, state))
  },

  setPrompt: (prompt) => set({ prompt }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setDuration: (duration) => set({ duration }),
  setInputImage: (inputImage) => set({ inputImage }),
}))

// The currently selected catalog model, if any
export function selectModel(state: GeneratorState): CatalogModel | undefined {
  return state.models.find((model) => model.id === state.modelId)
}

// Credit price of the current draft: image → flat credits, video → the
// per-duration table. null while the price cannot be determined yet.
export function selectCostCredits(state: GeneratorState): number | null {
  const model = selectModel(state)
  if (!model) return null
  if (model.type === 'image') return model.credits
  if (state.duration === undefined) return null
  return model.creditsByDuration[String(state.duration)] ?? null
}

// The exact POST /api/generations payload, or null while the draft is not
// submittable (no model, or trimmed prompt under the contract's 2-char minimum)
export function selectCreateInput(state: GeneratorState): CreateGenerationInput | null {
  const model = selectModel(state)
  const prompt = state.prompt.trim()
  if (!model || prompt.length < 2) return null
  return {
    modelId: model.id,
    prompt,
    aspectRatio: state.aspectRatio,
    // Optional fields are omitted (not sent as undefined) — the wire payload
    // must match createGenerationInputSchema exactly
    ...(model.type === 'video' && state.duration !== undefined ? { duration: state.duration } : {}),
    ...(state.inputImage ? { inputImage: state.inputImage } : {}),
  }
}
