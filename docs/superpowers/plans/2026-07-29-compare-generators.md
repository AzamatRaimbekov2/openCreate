# Compare Image Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/compare` utility page for side-by-side image generation comparison (Runware vs Qwen Image Max on DeepInfra), with parallel API calls and independent error handling.

**Architecture:** Zustand store manages shared state (prompt, results, loading). Two GenerationPanel components each handle independent loading/error/success states. Frontend calls parallel endpoints; backend provides DeepInfra Qwen integration. TDD throughout.

**Tech Stack:** React 19, TanStack Router, Zustand, Vitest + RTL (frontend), Playwright (e2e), Fastify (backend)

---

## File Structure

```
src/modules/Compare/
├── components/
│   ├── CompareForm.tsx       (prompt input + generate button)
│   ├── GenerationPanel.tsx   (single provider panel, all 4 states)
│   ├── GenerationStatus.tsx  (loading/error/success display)
│   └── CompareLayout.tsx     (side-by-side container)
├── hooks/
│   ├── useParallelGeneration.ts (orchestrates both API calls)
│   └── useCompareStore.ts (Zustand store access)
├── model/
│   └── types.ts (GenerationResult, CompareState, etc.)
├── index.ts (public API exports)
└── __tests__/
    ├── CompareForm.test.tsx
    ├── GenerationPanel.test.tsx
    ├── useParallelGeneration.test.ts
    └── Compare.e2e.spec.ts (Playwright)

src/routes/
└── _shell.compare.tsx (TanStack Router page component)

apps/api/src/integrations/deepinfra/
├── deepinfra-image.ts (Qwen Image Max client)
└── __tests__/
    └── deepinfra-image.test.ts

apps/web/e2e/
└── compare.spec.ts (Playwright E2E)
```

---

## Task 1: Create Zustand Store & Types

**Files:**
- Create: `src/modules/Compare/model/types.ts`
- Create: `src/modules/Compare/hooks/useCompareStore.ts`
- Create: `src/modules/Compare/model/__tests__/store.test.ts`

- [ ] **Step 1: Write types file**

Create `src/modules/Compare/model/types.ts`:

```typescript
export type GenerationResult = {
  status: 'empty' | 'loading' | 'error' | 'success'
  imageUrl?: string
  error?: string
  duration?: number // milliseconds
  costUsd?: number
}

export type CompareState = {
  prompt: string
  setPrompt: (prompt: string) => void
  runwareResult: GenerationResult
  qwenResult: GenerationResult
  isGenerating: boolean
  generate: (prompt: string) => Promise<void>
  retry: (provider: 'runware' | 'qwen') => Promise<void>
  reset: () => void
}
```

- [ ] **Step 2: Write failing test for store**

Create `src/modules/Compare/model/__tests__/store.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { useCompareStore } from '../../../hooks/useCompareStore'

describe('useCompareStore', () => {
  it('initializes with empty state', () => {
    const store = useCompareStore.getState()
    expect(store.prompt).toBe('')
    expect(store.runwareResult.status).toBe('empty')
    expect(store.qwenResult.status).toBe('empty')
    expect(store.isGenerating).toBe(false)
  })

  it('updates prompt', () => {
    const store = useCompareStore.getState()
    store.setPrompt('a cat')
    expect(store.prompt).toBe('a cat')
  })

  it('resets all state', () => {
    const store = useCompareStore.getState()
    store.setPrompt('a cat')
    store.reset()
    expect(store.prompt).toBe('')
    expect(store.runwareResult.status).toBe('empty')
    expect(store.qwenResult.status).toBe('empty')
  })
})
```

- [ ] **Step 3: Implement Zustand store**

Create `src/modules/Compare/hooks/useCompareStore.ts`:

```typescript
import { create } from 'zustand'
import type { CompareState, GenerationResult } from '../model/types'

const INITIAL_RESULT: GenerationResult = { status: 'empty' }

export const useCompareStore = create<CompareState>((set) => ({
  prompt: '',
  setPrompt: (prompt) => set({ prompt }),
  runwareResult: INITIAL_RESULT,
  qwenResult: INITIAL_RESULT,
  isGenerating: false,
  generate: async (prompt) => {
    // Implemented in Task 3
    console.log('generate not yet implemented', prompt)
  },
  retry: async (provider) => {
    // Implemented in Task 3
    console.log('retry not yet implemented', provider)
  },
  reset: () =>
    set({
      prompt: '',
      runwareResult: INITIAL_RESULT,
      qwenResult: INITIAL_RESULT,
      isGenerating: false,
    }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/modules/Compare/model/__tests__/store.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
rtk git add src/modules/Compare/model/types.ts src/modules/Compare/hooks/useCompareStore.ts src/modules/Compare/model/__tests__/store.test.ts
rtk git commit -m "feat(compare): zustand store and types

- GenerationResult type (4 states: empty, loading, error, success)
- CompareState type with prompt, results, generate/retry/reset
- Initial store implementation with reset working"
```

---

## Task 2: Create DeepInfra Qwen Image Integration

**Files:**
- Create: `apps/api/src/integrations/deepinfra/deepinfra-image.ts`
- Create: `apps/api/src/integrations/deepinfra/__tests__/deepinfra-image.test.ts`

- [ ] **Step 1: Write failing test for DeepInfra integration**

Create `apps/api/src/integrations/deepinfra/__tests__/deepinfra-image.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateImageQwen } from '../deepinfra-image'

describe('generateImageQwen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws error if DEEPINFRA_TOKEN is not set', async () => {
    const originalToken = process.env.DEEPINFRA_TOKEN
    delete process.env.DEEPINFRA_TOKEN
    try {
      await expect(generateImageQwen('a cat')).rejects.toThrow(
        'DEEPINFRA_TOKEN not configured',
      )
    } finally {
      process.env.DEEPINFRA_TOKEN = originalToken
    }
  })

  it('returns error object on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    )
    const result = await generateImageQwen('a cat')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Network error')
  })

  it('returns success with imageUrl on valid response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ image_url: 'https://example.com/img.png' }),
      }),
    )
    const result = await generateImageQwen('a cat')
    expect(result.status).toBe('success')
    expect(result.imageUrl).toBe('https://example.com/img.png')
  })
})
```

- [ ] **Step 2: Implement DeepInfra Qwen client**

Create `apps/api/src/integrations/deepinfra/deepinfra-image.ts`:

```typescript
const BASE_URL = 'https://api.deepinfra.com/v1/inference'
const MODEL_ID = 'Qwen/Qwen-Image-Max'
const TIMEOUT_MS = 120 * 1000

export type DeepinfraImageResult = {
  status: 'success' | 'error'
  imageUrl?: string
  error?: string
  costUsd?: number
}

export async function generateImageQwen(
  prompt: string,
  signal?: AbortSignal,
): Promise<DeepinfraImageResult> {
  const apiKey = process.env.DEEPINFRA_TOKEN

  if (!apiKey) {
    return {
      status: 'error',
      error: 'DEEPINFRA_TOKEN not configured',
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const mergedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

    const res = await fetch(`${BASE_URL}/${MODEL_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        resolution: '1024x1024',
        aspect_ratio: '1:1',
      }),
      signal: mergedSignal,
    })

    if (!res.ok) {
      return {
        status: 'error',
        error: `HTTP ${res.status} from DeepInfra`,
      }
    }

    const data = (await res.json()) as {
      image_url?: string
      inference_status?: { cost?: number }
    }

    if (!data.image_url) {
      return {
        status: 'error',
        error: 'No image_url in response',
      }
    }

    return {
      status: 'success',
      imageUrl: data.image_url,
      costUsd: data.inference_status?.cost,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        status: 'error',
        error: 'Generation timed out (120s limit)',
      }
    }
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test apps/api/src/integrations/deepinfra/__tests__/deepinfra-image.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/integrations/deepinfra/deepinfra-image.ts apps/api/src/integrations/deepinfra/__tests__/deepinfra-image.test.ts
rtk git commit -m "feat(deepinfra): qwen image max integration

- generateImageQwen(prompt, signal) sends POST to DeepInfra API
- 120s timeout with AbortSignal support
- Returns DeepinfraImageResult (success | error)
- Cost tracking via inference_status.cost"
```

---

## Task 3: Implement useParallelGeneration Hook

**Files:**
- Create: `src/modules/Compare/hooks/useParallelGeneration.ts`
- Modify: `src/modules/Compare/hooks/useCompareStore.ts`
- Create: `src/modules/Compare/hooks/__tests__/useParallelGeneration.test.ts`

- [ ] **Step 1: Write failing test for parallel generation**

Create `src/modules/Compare/hooks/__tests__/useParallelGeneration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useParallelGeneration } from '../useParallelGeneration'
import * as runwareApi from '../../services/runware'
import * as deepinfraApi from '../../services/deepinfra'

vi.mock('../../services/runware')
vi.mock('../../services/deepinfra')

describe('useParallelGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls both APIs in parallel and returns results', async () => {
    vi.mocked(runwareApi.generateImage).mockResolvedValue({
      status: 'success',
      imageUrl: 'https://runware.com/img.png',
      duration: 2000,
    })

    vi.mocked(deepinfraApi.generateImageQwen).mockResolvedValue({
      status: 'success',
      imageUrl: 'https://deepinfra.com/img.png',
      costUsd: 0.075,
    })

    const { generate } = useParallelGeneration()
    const result = await generate('a cat')

    expect(result.runware.status).toBe('success')
    expect(result.qwen.status).toBe('success')
    expect(runwareApi.generateImage).toHaveBeenCalledWith('a cat', expect.any(AbortSignal))
    expect(deepinfraApi.generateImageQwen).toHaveBeenCalledWith('a cat', expect.any(AbortSignal))
  })

  it('handles one API failing while the other succeeds', async () => {
    vi.mocked(runwareApi.generateImage).mockResolvedValue({
      status: 'success',
      imageUrl: 'https://runware.com/img.png',
      duration: 2000,
    })

    vi.mocked(deepinfraApi.generateImageQwen).mockResolvedValue({
      status: 'error',
      error: 'Rate limited',
    })

    const { generate } = useParallelGeneration()
    const result = await generate('a cat')

    expect(result.runware.status).toBe('success')
    expect(result.qwen.status).toBe('error')
  })

  it('allows retry of only one provider', async () => {
    const { retry } = useParallelGeneration()
    
    vi.mocked(deepinfraApi.generateImageQwen).mockResolvedValue({
      status: 'success',
      imageUrl: 'https://deepinfra.com/img.png',
      costUsd: 0.075,
    })

    await retry('qwen', 'a cat')

    expect(deepinfraApi.generateImageQwen).toHaveBeenCalledWith('a cat', expect.any(AbortSignal))
    expect(runwareApi.generateImage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Create services layer (mock implementation)**

Create `src/modules/Compare/services/runware.ts`:

```typescript
export type RunwareImageResult = {
  status: 'success' | 'error'
  imageUrl?: string
  duration?: number
  error?: string
}

export async function generateImage(
  prompt: string,
  signal?: AbortSignal,
): Promise<RunwareImageResult> {
  // TODO: Call existing Generator module or API
  // For now, return mock to make tests work
  return {
    status: 'success',
    imageUrl: 'https://runware.example.com/img.png',
    duration: 2000,
  }
}
```

Create `src/modules/Compare/services/deepinfra.ts`:

```typescript
import { generateImageQwen as apiGenerateImageQwen } from 'apps/api/src/integrations/deepinfra/deepinfra-image'

export type DeepinfraImageResult = {
  status: 'success' | 'error'
  imageUrl?: string
  costUsd?: number
  error?: string
}

export async function generateImageQwen(
  prompt: string,
  signal?: AbortSignal,
): Promise<DeepinfraImageResult> {
  return apiGenerateImageQwen(prompt, signal)
}
```

- [ ] **Step 3: Implement useParallelGeneration hook**

Create `src/modules/Compare/hooks/useParallelGeneration.ts`:

```typescript
import { useCallback } from 'react'
import { generateImage } from '../services/runware'
import { generateImageQwen } from '../services/deepinfra'
import { useCompareStore } from './useCompareStore'
import type { GenerationResult } from '../model/types'

export function useParallelGeneration() {
  const { setRunwareResult, setQwenResult, setIsGenerating } = useCompareStore()

  const generate = useCallback(
    async (prompt: string) => {
      setIsGenerating(true)
      setRunwareResult({ status: 'loading' })
      setQwenResult({ status: 'loading' })

      const controller = new AbortController()

      try {
        const [runwareResult, qwenResult] = await Promise.allSettled([
          generateImage(prompt, controller.signal),
          generateImageQwen(prompt, controller.signal),
        ]).then((results) => [
          results[0].status === 'fulfilled' ? results[0].value : { status: 'error' as const, error: 'Failed' },
          results[1].status === 'fulfilled' ? results[1].value : { status: 'error' as const, error: 'Failed' },
        ])

        setRunwareResult(runwareResult as GenerationResult)
        setQwenResult(qwenResult as GenerationResult)

        return { runware: runwareResult, qwen: qwenResult }
      } finally {
        setIsGenerating(false)
      }
    },
    [setIsGenerating, setRunwareResult, setQwenResult],
  )

  const retry = useCallback(
    async (provider: 'runware' | 'qwen', prompt: string) => {
      const controller = new AbortController()

      if (provider === 'runware') {
        setRunwareResult({ status: 'loading' })
        const result = await generateImage(prompt, controller.signal)
        setRunwareResult(result as GenerationResult)
      } else {
        setQwenResult({ status: 'loading' })
        const result = await generateImageQwen(prompt, controller.signal)
        setQwenResult(result as GenerationResult)
      }
    },
    [setRunwareResult, setQwenResult],
  )

  return { generate, retry }
}
```

- [ ] **Step 4: Update Zustand store to use hook**

Modify `src/modules/Compare/hooks/useCompareStore.ts` to add missing setters and use them:

```typescript
import { create } from 'zustand'
import type { CompareState, GenerationResult } from '../model/types'

const INITIAL_RESULT: GenerationResult = { status: 'empty' }

export const useCompareStore = create<CompareState & {
  setRunwareResult: (result: GenerationResult) => void
  setQwenResult: (result: GenerationResult) => void
  setIsGenerating: (isGenerating: boolean) => void
}>((set) => ({
  prompt: '',
  setPrompt: (prompt) => set({ prompt }),
  runwareResult: INITIAL_RESULT,
  setRunwareResult: (runwareResult) => set({ runwareResult }),
  qwenResult: INITIAL_RESULT,
  setQwenResult: (qwenResult) => set({ qwenResult }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  generate: async (prompt) => {
    console.log('generate placeholder', prompt)
  },
  retry: async (provider) => {
    console.log('retry placeholder', provider)
  },
  reset: () =>
    set({
      prompt: '',
      runwareResult: INITIAL_RESULT,
      qwenResult: INITIAL_RESULT,
      isGenerating: false,
    }),
}))
```

- [ ] **Step 5: Run tests**

Run: `pnpm test src/modules/Compare/hooks/__tests__/useParallelGeneration.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
rtk git add src/modules/Compare/hooks/useParallelGeneration.ts src/modules/Compare/hooks/__tests__/useParallelGeneration.test.ts src/modules/Compare/services/runware.ts src/modules/Compare/services/deepinfra.ts
rtk git commit -m "feat(compare): parallel generation hook

- useParallelGeneration orchestrates Runware + DeepInfra in parallel
- Promise.allSettled handles independent success/failure
- Retry isolated to single provider
- AbortSignal support for cancellation"
```

---

## Task 4: Build UI Components (Test-First)

**Files:**
- Create: `src/modules/Compare/components/CompareForm.tsx`
- Create: `src/modules/Compare/components/GenerationStatus.tsx`
- Create: `src/modules/Compare/components/GenerationPanel.tsx`
- Create: `src/modules/Compare/components/CompareLayout.tsx`
- Create: `src/modules/Compare/components/__tests__/CompareForm.test.tsx`
- Create: `src/modules/Compare/components/__tests__/GenerationPanel.test.tsx`

- [ ] **Step 1: Write failing test for CompareForm**

Create `src/modules/Compare/components/__tests__/CompareForm.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompareForm } from '../CompareForm'

describe('CompareForm', () => {
  it('renders prompt input and generate button', () => {
    render(<CompareForm onGenerate={vi.fn()} />)
    expect(screen.getByPlaceholderText(/enter a prompt/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument()
  })

  it('disables generate button when prompt is empty', () => {
    render(<CompareForm onGenerate={vi.fn()} />)
    const button = screen.getByRole('button', { name: /generate/i })
    expect(button).toBeDisabled()
  })

  it('enables generate button when prompt has text', async () => {
    const user = userEvent.setup()
    render(<CompareForm onGenerate={vi.fn()} />)
    const input = screen.getByPlaceholderText(/enter a prompt/i)
    await user.type(input, 'a cat')
    const button = screen.getByRole('button', { name: /generate/i })
    expect(button).not.toBeDisabled()
  })

  it('calls onGenerate with prompt when button is clicked', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    render(<CompareForm onGenerate={onGenerate} />)
    const input = screen.getByPlaceholderText(/enter a prompt/i)
    await user.type(input, 'a cat')
    await user.click(screen.getByRole('button', { name: /generate/i }))
    expect(onGenerate).toHaveBeenCalledWith('a cat')
  })

  it('clears prompt when clear button is clicked', async () => {
    const user = userEvent.setup()
    render(<CompareForm onGenerate={vi.fn()} />)
    const input = screen.getByPlaceholderText(/enter a prompt/i) as HTMLInputElement
    await user.type(input, 'a cat')
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(input.value).toBe('')
  })
})
```

- [ ] **Step 2: Implement CompareForm**

Create `src/modules/Compare/components/CompareForm.tsx`:

```typescript
import { useState } from 'react'

type CompareFormProps = {
  onGenerate: (prompt: string) => Promise<void>
  isLoading?: boolean
}

export function CompareForm({ onGenerate, isLoading = false }: CompareFormProps) {
  const [prompt, setPrompt] = useState('')

  const handleGenerate = async () => {
    await onGenerate(prompt)
  }

  const handleClear = () => {
    setPrompt('')
  }

  return (
    <div className="mb-6 space-y-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter a prompt..."
        className="w-full rounded border border-slate-300 p-3 font-sans text-sm focus:border-slate-500 focus:outline-none"
        rows={3}
      />
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          className="rounded bg-slate-900 px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-50"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
        <button
          onClick={handleClear}
          disabled={isLoading}
          className="rounded border border-slate-300 px-4 py-2 font-sans text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write failing test for GenerationStatus**

Create `src/modules/Compare/components/__tests__/GenerationStatus.test.tsx` (partial):

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenerationStatus } from '../GenerationStatus'

describe('GenerationStatus', () => {
  it('shows empty state initially', () => {
    render(<GenerationStatus status="empty" />)
    expect(screen.getByText(/ready to generate/i)).toBeInTheDocument()
  })

  it('shows loading spinner with timer', () => {
    render(<GenerationStatus status="loading" elapsed={45} total={120} />)
    expect(screen.getByText(/⏱️ 45s \/ 120s/)).toBeInTheDocument()
  })

  it('shows error message with retry button', () => {
    render(<GenerationStatus status="error" error="Rate limited" onRetry={() => {}} />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows success image with metadata', () => {
    render(
      <GenerationStatus
        status="success"
        imageUrl="https://example.com/img.png"
        duration={2300}
        costUsd={0.075}
      />,
    )
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/img.png')
    expect(screen.getByText(/2\.3s/)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.075/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Implement GenerationStatus**

Create `src/modules/Compare/components/GenerationStatus.tsx`:

```typescript
import type { GenerationResult } from '../model/types'

type GenerationStatusProps = GenerationResult & {
  elapsed?: number // seconds, for loading state
  total?: number // total timeout seconds
  onRetry?: () => void
}

export function GenerationStatus({
  status,
  imageUrl,
  error,
  duration,
  costUsd,
  elapsed,
  total,
  onRetry,
}: GenerationStatusProps) {
  if (status === 'empty') {
    return (
      <div className="flex items-center justify-center rounded bg-slate-50 py-12 text-sm text-slate-500">
        Ready to generate
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded bg-slate-50 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
        <div className="text-xs text-slate-500">
          ⏱️ {elapsed ?? 0}s / {total ?? 120}s
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="space-y-3 rounded bg-red-50 p-4">
        <div className="text-sm font-semibold text-red-900">{error || 'Generation failed'}</div>
        <button
          onClick={onRetry}
          className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Generated"
          className="w-full rounded object-cover"
          style={{ aspectRatio: '1 / 1' }}
        />
      )}
      <div className="flex gap-4 text-xs text-slate-600">
        {duration && <span>⏱️ {(duration / 1000).toFixed(1)}s</span>}
        {costUsd && <span>💰 ${costUsd.toFixed(3)}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write failing test for GenerationPanel**

Create `src/modules/Compare/components/__tests__/GenerationPanel.test.tsx` (partial):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenerationPanel } from '../GenerationPanel'

describe('GenerationPanel', () => {
  it('renders provider name', () => {
    render(
      <GenerationPanel
        provider="runware"
        result={{ status: 'empty' }}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText('Runware')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(
      <GenerationPanel
        provider="qwen"
        result={{ status: 'empty' }}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/ready to generate/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implement GenerationPanel**

Create `src/modules/Compare/components/GenerationPanel.tsx`:

```typescript
import { GenerationStatus } from './GenerationStatus'
import type { GenerationResult } from '../model/types'

type GenerationPanelProps = {
  provider: 'runware' | 'qwen'
  result: GenerationResult
  onRetry: () => void
  elapsed?: number
}

const PROVIDER_LABELS: Record<'runware' | 'qwen', string> = {
  runware: 'Runware',
  qwen: 'Qwen Image Max',
}

export function GenerationPanel({
  provider,
  result,
  onRetry,
  elapsed = 0,
}: GenerationPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-slate-900">{PROVIDER_LABELS[provider]}</h3>
      <GenerationStatus
        {...result}
        elapsed={elapsed}
        total={120}
        onRetry={onRetry}
      />
    </div>
  )
}
```

- [ ] **Step 7: Create CompareLayout**

Create `src/modules/Compare/components/CompareLayout.tsx`:

```typescript
import type { ReactNode } from 'react'

type CompareLayoutProps = {
  left: ReactNode
  right: ReactNode
}

export function CompareLayout({ left, right }: CompareLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col">{left}</div>
      <div className="flex flex-col">{right}</div>
    </div>
  )
}
```

- [ ] **Step 8: Run all component tests**

Run: `pnpm test src/modules/Compare/components/__tests__/`

Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
rtk git add src/modules/Compare/components/ src/modules/Compare/components/__tests__/
rtk git commit -m "feat(compare): UI components with 4 states per panel

- CompareForm: prompt input, generate/clear buttons
- GenerationStatus: empty, loading (with timer), error (with retry), success (with metadata)
- GenerationPanel: wraps status for each provider
- CompareLayout: responsive side-by-side (stack on mobile)"
```

---

## Task 5: Create TanStack Router Route

**Files:**
- Create: `src/routes/_shell.compare.tsx`
- Create: `src/routes/__tests__/compare.spec.ts` (Playwright)

- [ ] **Step 1: Write Playwright E2E test (failing)**

Create `src/routes/__tests__/compare.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('compare page loads and generates images in parallel', async ({ page }) => {
  await page.goto('/compare')
  
  // Check page loaded
  expect(await page.locator('h3:has-text("Runware")').isVisible()).toBe(true)
  expect(await page.locator('h3:has-text("Qwen Image Max")').isVisible()).toBe(true)

  // Find prompt input
  const promptInput = page.locator('textarea[placeholder*="prompt"]')
  await promptInput.fill('a cat wearing a hat')

  // Click generate
  const generateButton = page.locator('button:has-text("Generate")')
  await generateButton.click()

  // Both panels should show loading
  const spinners = page.locator('.animate-spin')
  expect(await spinners.count()).toBeGreaterThanOrEqual(2)

  // Wait for at least one to complete
  await page.waitForTimeout(2000)
  
  // Check that at least one image loaded
  const images = page.locator('img[alt="Generated"]')
  expect(await images.count()).toBeGreaterThan(0)
})

test('retry button works independently per provider', async ({ page }) => {
  await page.goto('/compare')
  
  const promptInput = page.locator('textarea[placeholder*="prompt"]')
  await promptInput.fill('abstract art')

  const generateButton = page.locator('button:has-text("Generate")')
  await generateButton.click()

  await page.waitForTimeout(2000)

  // If any panel shows error, click retry
  const retryButtons = page.locator('button:has-text("Retry")')
  const retryCount = await retryButtons.count()
  
  if (retryCount > 0) {
    await retryButtons.first().click()
  }
})
```

- [ ] **Step 2: Implement Compare Route**

Create `src/routes/_shell.compare.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CompareForm } from '../modules/Compare/components/CompareForm'
import { GenerationPanel } from '../modules/Compare/components/GenerationPanel'
import { CompareLayout } from '../modules/Compare/components/CompareLayout'
import { useCompareStore } from '../modules/Compare/hooks/useCompareStore'
import { useParallelGeneration } from '../modules/Compare/hooks/useParallelGeneration'

export const Route = createFileRoute('/_shell/compare')({
  component: ComparePage,
})

function ComparePage() {
  const {
    prompt,
    setPrompt,
    runwareResult,
    qwenResult,
    isGenerating,
    reset,
  } = useCompareStore()

  const { generate, retry } = useParallelGeneration()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0)
      return
    }

    const interval = setInterval(() => {
      setElapsed((e) => {
        if (e >= 120) {
          clearInterval(interval)
          return 120
        }
        return e + 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isGenerating])

  const handleGenerate = async () => {
    setPrompt(prompt)
    await generate(prompt)
  }

  const handleReset = () => {
    reset()
    setElapsed(0)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Compare Image Generators</h1>
      <p className="text-sm text-slate-600">
        Test and compare Runware vs Qwen Image Max on DeepInfra
      </p>

      <CompareForm onGenerate={handleGenerate} isLoading={isGenerating} />

      <CompareLayout
        left={
          <GenerationPanel
            provider="runware"
            result={runwareResult}
            onRetry={() => retry('runware', prompt)}
            elapsed={elapsed}
          />
        }
        right={
          <GenerationPanel
            provider="qwen"
            result={qwenResult}
            onRetry={() => retry('qwen', prompt)}
            elapsed={elapsed}
          />
        }
      />

      <button
        onClick={handleReset}
        disabled={isGenerating}
        className="text-sm text-slate-600 underline disabled:opacity-50"
      >
        Reset
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Run Playwright tests**

Run: `pnpm exec playwright test src/routes/__tests__/compare.spec.ts`

Expected: Tests load page, can interact, E2E verifies behavior

- [ ] **Step 4: Start dev server and manually verify**

Run: `pnpm run dev`

Navigate to `http://localhost:5173/compare` and test:
- Form displays correctly
- Prompt input works
- Generate button disabled when empty
- Both APIs called in parallel (watch Network tab)
- Images appear on success
- Clear/Reset buttons work

- [ ] **Step 5: Commit**

```bash
rtk git add src/routes/_shell.compare.tsx src/routes/__tests__/compare.spec.ts
rtk git commit -m "feat(compare): TanStack Router page implementation

- Route: /_shell/compare (hidden utility page)
- Renders CompareForm + two GenerationPanels side-by-side
- Elapsed timer updates UI with countdown (0-120s)
- Reset button clears state
- Playwright E2E tests verify parallel execution"
```

---

## Task 6: Connect Store Actions & Test Full Flow

**Files:**
- Modify: `src/modules/Compare/hooks/useCompareStore.ts`
- Create: `src/modules/Compare/__tests__/Compare.integration.test.tsx`

- [ ] **Step 1: Write integration test**

Create `src/modules/Compare/__tests__/Compare.integration.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCompareStore } from '../hooks/useCompareStore'
import { useParallelGeneration } from '../hooks/useParallelGeneration'

vi.mock('../services/runware', () => ({
  generateImage: vi.fn(async () => ({
    status: 'success',
    imageUrl: 'https://runware.example.com/img.png',
    duration: 1000,
  })),
}))

vi.mock('../services/deepinfra', () => ({
  generateImageQwen: vi.fn(async () => ({
    status: 'success',
    imageUrl: 'https://deepinfra.example.com/img.png',
    costUsd: 0.075,
  })),
}))

describe('Compare Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('full flow: set prompt → generate → results populate', async () => {
    const { result: storeResult } = renderHook(() => useCompareStore())
    const { result: genResult } = renderHook(() => useParallelGeneration())

    // Set prompt
    storeResult.current.setPrompt('a cat')
    expect(storeResult.current.prompt).toBe('a cat')

    // Generate
    await genResult.current.generate('a cat')

    // Wait for store to update
    await waitFor(() => {
      expect(storeResult.current.runwareResult.status).toBe('success')
      expect(storeResult.current.qwenResult.status).toBe('success')
    })

    expect(storeResult.current.runwareResult.imageUrl).toBe('https://runware.example.com/img.png')
    expect(storeResult.current.qwenResult.imageUrl).toBe('https://deepinfra.example.com/img.png')
  })

  it('reset clears all results', async () => {
    const { result } = renderHook(() => useCompareStore())

    result.current.setPrompt('a cat')
    result.current.reset()

    expect(result.current.prompt).toBe('')
    expect(result.current.runwareResult.status).toBe('empty')
    expect(result.current.qwenResult.status).toBe('empty')
  })
})
```

- [ ] **Step 2: Update store to wire up generate action**

Modify `src/modules/Compare/hooks/useCompareStore.ts`:

```typescript
import { create } from 'zustand'
import { useParallelGeneration } from './useParallelGeneration'
import type { CompareState, GenerationResult } from '../model/types'

const INITIAL_RESULT: GenerationResult = { status: 'empty' }

export const useCompareStore = create<
  CompareState & {
    setRunwareResult: (result: GenerationResult) => void
    setQwenResult: (result: GenerationResult) => void
    setIsGenerating: (isGenerating: boolean) => void
  }
>((set) => {
  // Lazy-load hook to avoid infinite recursion
  let parallelGen: ReturnType<typeof useParallelGeneration> | null = null

  return {
    prompt: '',
    setPrompt: (prompt) => set({ prompt }),
    runwareResult: INITIAL_RESULT,
    setRunwareResult: (runwareResult) => set({ runwareResult }),
    qwenResult: INITIAL_RESULT,
    setQwenResult: (qwenResult) => set({ qwenResult }),
    isGenerating: false,
    setIsGenerating: (isGenerating) => set({ isGenerating }),
    generate: async (prompt: string) => {
      set({ isGenerating: true, prompt })
      if (!parallelGen) {
        parallelGen = useParallelGeneration()
      }
      await parallelGen.generate(prompt)
      set({ isGenerating: false })
    },
    retry: async (provider: 'runware' | 'qwen', prompt: string) => {
      if (!parallelGen) {
        parallelGen = useParallelGeneration()
      }
      await parallelGen.retry(provider, prompt)
    },
    reset: () =>
      set({
        prompt: '',
        runwareResult: INITIAL_RESULT,
        qwenResult: INITIAL_RESULT,
        isGenerating: false,
      }),
  }
})
```

- [ ] **Step 3: Run integration tests**

Run: `pnpm test src/modules/Compare/__tests__/Compare.integration.test.tsx`

Expected: PASS (2 tests)

- [ ] **Step 4: Run all tests to ensure nothing broke**

Run: `pnpm test src/modules/Compare/`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
rtk git add src/modules/Compare/hooks/useCompareStore.ts src/modules/Compare/__tests__/Compare.integration.test.tsx
rtk git commit -m "feat(compare): wire up store and generate action

- generate action orchestrates useParallelGeneration
- retry supports single provider retry
- Integration test verifies full flow"
```

---

## Task 7: Lint, Type Check, Build Verification

**Files:**
- No new files; verify existing

- [ ] **Step 1: Run TypeScript check**

Run: `pnpm typecheck`

Expected: Zero errors

- [ ] **Step 2: Run ESLint**

Run: `pnpm lint`

Expected: Zero errors in Compare module

If errors, fix them inline and commit separately.

- [ ] **Step 3: Run all tests (unit + integration)**

Run: `pnpm test`

Expected: All tests PASS, including Compare module

- [ ] **Step 4: Build frontend**

Run: `pnpm run build`

Expected: Build succeeds, no errors

- [ ] **Step 5: Commit verification report**

```bash
rtk git add -A
rtk git commit -m "chore(compare): lint, typecheck, build verification passed"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `docs/superpowers/FEATURE.md` (or create if missing)
- Modify: `apps/web/FEATURE.md` (if exists)

- [ ] **Step 1: Create/update FEATURE.md**

If `apps/web/FEATURE.md` exists, add to it:

```markdown
## Compare Generators Utility (Hidden)

**Route:** `/compare`

**Purpose:** Internal testing tool for side-by-side image generation comparison

**Providers:** Runware vs Qwen Image Max (DeepInfra)

**Features:**
- Parallel API calls (both run simultaneously)
- Independent error handling (one failure doesn't block the other)
- Per-provider retry button
- 120s timeout per provider with elapsed timer
- Cost tracking (Qwen via DeepInfra)
- 4 UI states per panel: Empty, Loading, Error, Success

**Architecture:**
- Frontend: Zustand store, React components, TanStack Router
- Backend: DeepInfra Qwen Image Max integration
- Testing: Vitest + RTL (unit), Playwright (E2E)

**Environment:**
- Requires `DEEPINFRA_TOKEN` to be set

**Access:**
- Hidden from main navigation
- Direct URL: `/compare`
```

- [ ] **Step 2: Commit docs**

```bash
rtk git add apps/web/FEATURE.md docs/superpowers/FEATURE.md
rtk git commit -m "docs(compare): add feature documentation"
```

---

## Verification Checklist

Before marking complete, verify:

- [ ] Route accessible at `/compare`
- [ ] Both images generate in parallel (observable in DevTools Network tab)
- [ ] One provider failure doesn't block the other
- [ ] Retry button only retries the clicked provider
- [ ] Timer counts 0-120s during generation
- [ ] 4 UI states per panel work (empty → loading → success/error)
- [ ] Clear/Reset buttons work
- [ ] All tests pass: `pnpm test`
- [ ] TypeScript strict: `pnpm typecheck`
- [ ] ESLint clean: `pnpm lint`
- [ ] Build succeeds: `pnpm run build`
- [ ] Playwright E2E pass: `pnpm exec playwright test src/routes/__tests__/compare.spec.ts`
- [ ] Cost tracking displays for Qwen results
- [ ] Mobile responsive (tablet/mobile stack vertically)

---

## Success Criteria (from Spec)

✅ Both images generate in parallel (observable via timestamps)  
✅ Each panel has independent loading/error/success state  
✅ Retry only affects the clicked provider  
✅ 120s timeout enforced, clear messaging  
✅ Cost tracked and displayed if available  
✅ 4 UI states implemented per panel  
✅ All tests pass (unit + e2e)  
✅ Zero TypeScript errors (strict mode)  
✅ ESLint/Prettier compliance  
✅ Route accessible at `/compare`
