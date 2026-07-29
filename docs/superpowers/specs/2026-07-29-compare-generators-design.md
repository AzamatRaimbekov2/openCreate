# Compare Image Generators — Design Spec

**Date:** 2026-07-29  
**Status:** Approved  
**Scope:** Image generation comparison page (Runware vs Qwen Image Max on DeepInfra)

---

## Overview

A hidden utility page (`/compare`) for side-by-side comparison of image generation from two providers:
- **Runware** (existing integration)
- **Qwen Image Max** (DeepInfra)

Users enter one prompt, click "Generate", and both APIs run **in parallel**. Results display side-by-side (50/50 width). Each result tracks its own loading/error/success state independently.

---

## Navigation & Access

- **Route:** `/compare` (TanStack Router)
- **Visibility:** Hidden from main navigation (direct URL only)
- **Purpose:** Testing & comparison tool (not user-facing feature)

---

## Layout & UI

### Structure
```
┌─────────────────────────────────────────┐
│  CompareLayout (flex, gap-4)            │
├────────────────┬────────────────────────┤
│   Left Panel   │   Right Panel          │
│   (Runware)    │   (Qwen Image Max)     │
│   50% width    │   50% width            │
│                │                        │
│  ┌──────────┐  │  ┌──────────┐         │
│  │ Skeleton │  │  │ Skeleton │         │
│  │ on load  │  │  │ on load  │         │
│  └──────────┘  │  └──────────┘         │
│                │                        │
└────────────────┴────────────────────────┘

Top: CompareForm (prompt input + Generate button)
Bottom: Two GenerationPanels (side-by-side)
```

### Components

**CompareForm.tsx**
- Text input for prompt (multi-line, Tailwind-styled)
- "Generate" button (disabled during loading)
- "Clear" button (resets both panels + prompt)
- Character count if needed

**GenerationPanel.tsx** (2× instances)
- Header: Provider name (Runware | Qwen Image Max)
- Content area with 4 states:
  - **Empty:** "Ready to generate" message
  - **Loading:** Skeleton image (16:9 or square) + progress indicator (elapsed secs / 120)
  - **Error:** Red error box + "Retry" button (retries only this provider)
  - **Success:** Generated image + metadata (size, generation time, cost if available)

**CompareLayout.tsx**
- Flex container, responsive (flex-col on mobile, flex-row on desktop)
- Manages padding and gaps

**GenerationStatus.tsx** (internal to panels)
- Shows loading spinner, error, or success state
- Handles timeout display (seconds elapsed)

---

## State Management

**Zustand store:** `useCompareStore`

```typescript
type GenerationResult = {
  status: 'loading' | 'error' | 'success' | 'empty'
  imageUrl?: string
  error?: string
  duration?: number // ms
  costUsd?: number
}

type CompareState = {
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

---

## Parallel Generation Flow

**Trigger:** User clicks "Generate"

1. Validate prompt (not empty)
2. Set `isGenerating = true`, reset previous results to `loading` state
3. Create `AbortController` for cancellation
4. Launch **both** requests in parallel via `Promise.all()`:
   - `generateImageRunware(prompt, signal, timeout=120s)`
   - `generateImageQwen(prompt, signal, timeout=120s)`
5. Each promise resolves to `GenerationResult`
6. Store both results in Zustand
7. Set `isGenerating = false`

**Error handling:**
- If Runware fails → Runware panel shows error, Qwen continues (or vice versa)
- If both fail → show error on both panels
- AbortSignal allows cancellation of in-flight requests

**Retry:**
- Each panel has independent "Retry" button
- Clicking "Retry" only regenerates that provider
- Does **not** refetch the other provider

---

## API Integration

### Runware
- Use existing service/hook from `modules/Generator`
- Endpoint: internal openCreate generation API
- Response: `{ url: string }`

### Qwen Image Max (DeepInfra)
- New service: `apps/api/src/integrations/deepinfra/deepinfra-image.ts`
- Endpoint: `POST https://api.deepinfra.com/v1/inference/Qwen/Qwen-Image-Max`
- Request body:
  ```json
  {
    "prompt": "...",
    "resolution": "1024x1024", // or 1280x1280, based on viewport
    "aspect_ratio": "1:1" // or "16:9" / "9:16"
  }
  ```
- Response: `{ image_url: string }` or error
- Auth: Bearer token from `DEEPINFRA_TOKEN` env
- Timeout: 120 seconds (AbortSignal)

### Cost Tracking
- **Runware:** If available from existing API, include in result
- **Qwen:** DeepInfra returns `cost_usd` per request; display it

---

## 4 UI States

### Empty
- "Ready to generate" placeholder text
- Greyed-out or light styling

### Loading
- Skeleton image (16:9 aspect ratio, neutral grey)
- Countdown: "⏱️ 45s / 120s"
- Spinner or pulse animation

### Error
- Red background / red text
- Error message from API (sanitized)
- "Retry" button (only retries this provider)

### Success
- Generated image (full width of panel, object-fit: cover)
- Metadata below image:
  - Generation time (e.g., "2.3s")
  - Cost (e.g., "$0.075") if available
  - Dimensions of generated image

---

## Architecture

```
src/modules/Compare/
├── components/
│   ├── CompareForm.tsx       (prompt input + generate button)
│   ├── GenerationPanel.tsx   (single provider panel)
│   ├── GenerationStatus.tsx  (loading/error/success display)
│   └── CompareLayout.tsx     (side-by-side container)
├── hooks/
│   └── useParallelGeneration.ts (orchestrates both API calls)
├── model/
│   ├── store.ts              (Zustand store)
│   └── types.ts              (GenerationResult, CompareState)
├── index.ts                  (exports)
└── Compare.test.tsx          (vitest + RTL tests)

src/routes/
└── _shell.compare.tsx        (TanStack Router page)

src/services/ (or integrations/)
└── deepinfra-image.ts        (DeepInfra Qwen Image Max client)
```

---

## Testing

**Unit Tests (Vitest + RTL)**
- `CompareForm`: renders input + button, validation works
- `GenerationPanel`: displays all 4 states correctly
- `useParallelGeneration`: both promises resolve/reject independently
- Store: state updates correctly after generate/retry/reset

**E2E Tests (Playwright)**
- User types prompt → clicks Generate → both images load in parallel
- One provider fails → other still succeeds
- Retry button only retries the failed provider
- Clear button resets both panels + prompt

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty prompt | Disable Generate button, show validation error |
| Runware fails, Qwen succeeds | Show error in left panel, image in right |
| Both fail | Show errors in both panels, offer retry |
| Timeout (120s) | Cancel request, show "Generation timed out" |
| Network error | Show friendly error (not raw HTTP error) |
| User leaves page mid-generation | Abort both requests via AbortController |

---

## Mobile Responsiveness

- **Desktop:** Side-by-side (flex-row), 50% each
- **Tablet (768px+):** Side-by-side, adjust padding
- **Mobile (<768px):** Stack vertically (flex-col), 100% width each

---

## Success Criteria

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

---

## Notes

- This is a **testing utility**, not a user-facing feature (hidden from nav)
- Parallel execution intentional — shows real-time performance comparison
- Each provider has independent error handling — one failure doesn't block the other
- Cost tracking useful for operator margin calculation
- Future enhancement: save comparison history (not in MVP)
