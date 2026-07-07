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
// Terminal voice (v3): mono weight-400 30px headline on the void, one line,
// one green specimen-pill reload — even a crash whispers, never a panic screen.
function CrashFallback() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-void px-6 text-center">
      <h1 className="max-w-xl text-3xl font-normal text-white">{t('errors.crash.title')}</h1>
      <p className="max-w-md text-mist-dim">{t('errors.crash.description')}</p>
      <Button className="mt-3" onClick={() => window.location.reload()}>
        {t('errors.crash.reload')}
      </Button>
    </main>
  )
}
