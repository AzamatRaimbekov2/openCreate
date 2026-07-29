// apps/web/src/routes/_shell.compare.tsx
// Hidden model-evaluation page ('/compare', inside the AppShell layout) —
// NOT linked from any navigation on purpose: it is an operator tool reached by
// direct URL. Composition only: the form + one GenerationPanel per contender;
// all behavior lives in modules/Compare.
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { COMPARE_PROVIDERS, CompareForm, GenerationPanel, useCompareStore } from 'modules/Compare'

export const Route = createFileRoute('/_shell/compare')({
  component: ComparePage,
})

// NOT exported: route files may only export Route, or the router plugin
// cannot code-split the screen
function ComparePage() {
  const prompt = useCompareStore((state) => state.prompt)
  const results = useCompareStore((state) => state.results)
  const isGenerating = useCompareStore((state) => state.isGenerating)
  const setPrompt = useCompareStore((state) => state.setPrompt)
  const generateAll = useCompareStore((state) => state.generateAll)
  const retry = useCompareStore((state) => state.retry)
  const reset = useCompareStore((state) => state.reset)

  // Shared run stopwatch for the loading panels. Local to the page (not the
  // store): it is pure presentation, and a 1s interval in the store would
  // notify every subscriber for no data change. The counter RESETS in the
  // event handlers (not in the effect — react-hooks/set-state-in-effect) and
  // TICKS while any panel is loading, so single-panel retries get a live
  // stopwatch too, not just full runs.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const anyLoading = COMPARE_PROVIDERS.some(({ id }) => results[id].status === 'loading')
  useEffect(() => {
    if (!anyLoading) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [anyLoading])

  const handleGenerate = () => {
    setElapsedSeconds(0)
    void generateAll()
  }
  const handleRetry = (id: (typeof COMPARE_PROVIDERS)[number]['id']) => {
    setElapsedSeconds(0)
    void retry(id)
  }

  // Leaving the page cancels in-flight renders (they'd spend provider money
  // for images nobody will see) without clearing settled results — coming
  // back shows the last comparison.
  useEffect(() => {
    return () => useCompareStore.getState().abort()
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs text-mist-dim">model evaluation</span>
        <h1 className="text-3xl font-normal text-white">Compare image generators</h1>
        <p className="text-sm text-mist-dim">
          One prompt, three models in parallel: FLUX dev and Nano Banana Pro through the
          production Runware pipeline, Qwen Image Max direct via DeepInfra.
        </p>
      </header>

      <CompareForm
        prompt={prompt}
        isGenerating={isGenerating}
        onPromptChange={setPrompt}
        onGenerate={handleGenerate}
        onClear={reset}
      />

      {/* Stack on mobile, three columns from md up — each panel settles
          independently, so a slow contender never blocks the grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {COMPARE_PROVIDERS.map((provider) => (
          <GenerationPanel
            key={provider.id}
            label={provider.label}
            channel={provider.channel}
            result={results[provider.id]}
            elapsedSeconds={elapsedSeconds}
            onRetry={() => handleRetry(provider.id)}
          />
        ))}
      </div>
    </main>
  )
}
