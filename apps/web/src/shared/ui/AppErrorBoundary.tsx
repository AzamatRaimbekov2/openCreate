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

// Function child so the fallback can use hooks (the boundary itself cannot)
function CrashFallback() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('errors.crash.title')}</h1>
      <p className="max-w-md text-ink-soft">{t('errors.crash.description')}</p>
      <Button className="mt-2" onClick={() => window.location.reload()}>
        {t('errors.crash.reload')}
      </Button>
    </main>
  )
}
