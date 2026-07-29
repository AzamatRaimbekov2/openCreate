// apps/web/src/modules/Compare/components/CompareForm.tsx
// Prompt input + run controls for the /compare utility. CONTROLLED on purpose
// (prompt lives in the store, not local state) because retry needs the exact
// prompt of the last run after the form could have been edited — the store is
// the single owner, this component is presentation only.
import type { ChangeEvent } from 'react'
import { Button } from 'shared/ui'

export type CompareFormProps = {
  prompt: string
  // Disables both actions while a full run is in flight
  isGenerating: boolean
  onPromptChange: (value: string) => void
  onGenerate: () => void
  onClear: () => void
}

export function CompareForm({
  prompt,
  isGenerating,
  onPromptChange,
  onGenerate,
  onClear,
}: CompareFormProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(event.target.value)
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={prompt}
        onChange={handleChange}
        // aria-label instead of a visible <label>: the page's h1 already says
        // what this tool does; the field is self-evident to its operator user
        aria-label="Prompt"
        placeholder="Describe the image to generate on every model…"
        rows={3}
        // Terminal voice: hairline field on the void, no solid fills
        className="w-full resize-y rounded-lg border border-white/10 bg-transparent p-4 text-sm text-white placeholder:text-mist-dim focus:border-white/30 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={onGenerate}
          disabled={prompt.trim().length === 0}
          isLoading={isGenerating}
        >
          {isGenerating ? 'Generating…' : 'Generate'}
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={isGenerating}>
          Clear
        </Button>
      </div>
    </div>
  )
}
