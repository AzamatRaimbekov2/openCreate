// apps/web/src/shared/ui/AppErrorBoundary.tsx
// Root crash fallback (frontend-error-ux contract): a class error boundary —
// the only way to catch render errors in React — that swaps the crashed tree
// for a calm full-screen "technical update" screen with a reload action.
// Technical detail goes to the console/monitoring only, never to the user.
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

type AppErrorBoundaryProps = {
  // The subtree to guard — in this app, everything under the root route
  children: ReactNode
}

type AppErrorBoundaryState = {
  // Flips once on the first render crash; the fallback is a terminal state
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // User-safe copy is rendered by the fallback; raw detail stays here
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) return <CrashFallback />
    return this.props.children
  }
}

// Function child so the fallback can use hooks (the boundary itself cannot).
// Editorial voice (brief: "serif headline, one line, one action") — even a
// crash is typeset like the rest of the magazine, never a panic screen.
function CrashFallback() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      <h1 className="font-display text-4xl leading-[1.02] font-semibold tracking-tight text-ink md:text-5xl">
        {t('errors.crash.title')}
      </h1>
      <p className="max-w-md text-ink-soft">{t('errors.crash.description')}</p>
      <Button className="mt-3" onClick={() => window.location.reload()}>
        {t('errors.crash.reload')}
      </Button>
    </main>
  )
}
