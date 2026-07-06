// apps/web/src/modules/Generator/model/generatorStore.test.ts
// Behavior (plan Task 16): model switches normalize duration/aspect/inputImage
// to what the target model supports, type switches pick the first model of that
// type, and the cost/input selectors mirror the catalog pricing rules exactly.
import type { CatalogModel } from '@opencreate/contracts'
import {
  selectCostCredits,
  selectCreateInput,
  selectModel,
  useGeneratorStore,
} from './generatorStore'

// Minimal catalog fixtures mirroring the API catalog (apps/api catalog.ts)
const flash: CatalogModel = {
  id: 'flux-schnell',
  type: 'image',
  name: 'Flash',
  providerLabel: 'FLUX schnell',
  air: 'runware:100@1',
  tier: 'fast',
  supportsImageInput: false,
  aspectRatios: ['16:9', '1:1', '9:16'],
  credits: 1,
}
const swift: CatalogModel = {
  id: 'pixverse-v6',
  type: 'video',
  name: 'Swift',
  providerLabel: 'PixVerse V6',
  air: 'pixverse:1@8',
  tier: 'standard',
  supportsImageInput: true,
  aspectRatios: ['16:9', '1:1', '9:16'],
  durationOptions: [5, 8],
  creditsByDuration: { '5': 35, '8': 56 },
}
const motion: CatalogModel = {
  id: 'minimax-hailuo',
  type: 'video',
  name: 'Motion',
  providerLabel: 'MiniMax Hailuo 2.3',
  air: 'minimax:4@1',
  tier: 'standard',
  supportsImageInput: true,
  aspectRatios: ['16:9'],
  durationOptions: [6, 10],
  creditsByDuration: { '6': 35, '10': 60 },
}

// The store is a module-level singleton — restore pristine state between tests
beforeEach(() => {
  useGeneratorStore.setState(useGeneratorStore.getInitialState(), true)
})

describe('generatorStore', () => {
  it('setCatalog selects the first model of the current type', () => {
    useGeneratorStore.getState().setCatalog([flash, swift])
    const state = useGeneratorStore.getState()
    expect(state.modelId).toBe('flux-schnell')
    expect(selectModel(state)?.name).toBe('Flash')
  })

  it('setModel resets duration to the first supported option', () => {
    useGeneratorStore.getState().setCatalog([flash, swift, motion])
    useGeneratorStore.getState().setModel('pixverse-v6')
    expect(useGeneratorStore.getState().duration).toBe(5)
    // 5s is not offered by Motion → normalize to Motion's first option (6s)
    useGeneratorStore.getState().setModel('minimax-hailuo')
    expect(useGeneratorStore.getState().duration).toBe(6)
  })

  it('setModel clears the input image when the target model does not support it', () => {
    useGeneratorStore.getState().setCatalog([flash, swift])
    useGeneratorStore.getState().setModel('pixverse-v6')
    useGeneratorStore.getState().setInputImage('data:image/png;base64,AAA')
    useGeneratorStore.getState().setModel('flux-schnell')
    expect(useGeneratorStore.getState().inputImage).toBeNull()
  })

  it('setModel drops an unsupported aspect ratio to the first supported one', () => {
    useGeneratorStore.getState().setCatalog([flash, swift, motion])
    useGeneratorStore.getState().setAspectRatio('9:16')
    // Motion only offers 16:9
    useGeneratorStore.getState().setModel('minimax-hailuo')
    expect(useGeneratorStore.getState().aspectRatio).toBe('16:9')
  })

  it('selectCostCredits uses flat credits for images and the duration table for video', () => {
    useGeneratorStore.getState().setCatalog([flash, swift])
    expect(selectCostCredits(useGeneratorStore.getState())).toBe(1)
    useGeneratorStore.getState().setModel('pixverse-v6')
    expect(selectCostCredits(useGeneratorStore.getState())).toBe(35)
    useGeneratorStore.getState().setDuration(8)
    expect(selectCostCredits(useGeneratorStore.getState())).toBe(56)
  })

  it('type switch picks the first model of that type', () => {
    useGeneratorStore.getState().setCatalog([flash, swift, motion])
    useGeneratorStore.getState().setType('video')
    expect(useGeneratorStore.getState().modelId).toBe('pixverse-v6')
    useGeneratorStore.getState().setType('image')
    expect(useGeneratorStore.getState().modelId).toBe('flux-schnell')
  })

  it('selectCreateInput builds the exact CreateGenerationInput payload', () => {
    useGeneratorStore.getState().setCatalog([flash, swift])
    useGeneratorStore.getState().setType('video')
    useGeneratorStore.getState().setPrompt('  ocean waves  ')
    useGeneratorStore.getState().setAspectRatio('9:16')
    expect(selectCreateInput(useGeneratorStore.getState())).toEqual({
      modelId: 'pixverse-v6',
      prompt: 'ocean waves',
      aspectRatio: '9:16',
      duration: 5,
    })
  })

  it('selectCreateInput returns null while the trimmed prompt is under 2 chars', () => {
    useGeneratorStore.getState().setCatalog([flash])
    useGeneratorStore.getState().setPrompt(' a ')
    expect(selectCreateInput(useGeneratorStore.getState())).toBeNull()
  })
})
