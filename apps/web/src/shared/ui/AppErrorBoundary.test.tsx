// apps/web/src/shared/ui/AppErrorBoundary.test.tsx
// Behavior: children render untouched while healthy; a render crash is caught
// and replaced by the calm full-screen fallback with a reload action.
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'
// i18n init — fallback copy comes from the errors.crash.* keys
import 'shared/config/i18n'

// A component that always crashes during render
function Bomb(): never {
  throw new Error('boom')
}

describe('AppErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>safe content</p>
      </AppErrorBoundary>,
    )
    expect(screen.getByText('safe content')).toBeInTheDocument()
  })

  it('shows the crash fallback with a reload action when a child throws', () => {
    // React logs the caught error — keep the test output clean
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /technical update/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh the page/i })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
