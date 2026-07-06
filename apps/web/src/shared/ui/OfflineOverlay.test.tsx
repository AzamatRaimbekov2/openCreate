// apps/web/src/shared/ui/OfflineOverlay.test.tsx
// Behavior: overlay is absent while online, blocks the screen when the browser
// fires 'offline', and removes itself when connectivity returns ('online').
import { fireEvent, render, screen } from '@testing-library/react'
import { OfflineOverlay } from './OfflineOverlay'
// i18n init — overlay copy comes from the errors.offline.* keys
import 'shared/config/i18n'

// jsdom's navigator.onLine is a read-only getter — override it per test so the
// component's snapshot (navigator.onLine) matches the dispatched event.
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('OfflineOverlay', () => {
  afterEach(() => {
    setOnLine(true)
  })

  it('renders nothing while online', () => {
    setOnLine(true)
    render(<OfflineOverlay />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('blocks the screen on offline and hides again when back online', () => {
    setOnLine(true)
    render(<OfflineOverlay />)

    setOnLine(false)
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/no internet connection/i)

    setOnLine(true)
    fireEvent(window, new Event('online'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
