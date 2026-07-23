// apps/web/src/routes/__root.tsx
// Root route: wraps every screen with the global providers (TanStack Query,
// i18n side-effect init) and the app-wide error-UX surfaces — the crash
// boundary sits OUTSIDE the providers so even a provider failure still shows
// the calm fallback; the offline overlay renders above whatever screen is on.
// The <Toaster> is mounted here ONCE (inside the providers, so a toast action
// can run a query/mutation) — the single portal every module's `toast` calls
// render into, the non-blocking counterpart to the OfflineOverlay/error modal.
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from 'shared/config/queryClient'
import { AppErrorBoundary, NotFoundPage, OfflineOverlay, Toaster } from 'shared/ui'
import 'shared/config/i18n'

export const Route = createRootRoute({
  component: RootLayout,
  // Unknown paths render the custom 404 instead of TanStack's default
  notFoundComponent: NotFoundPage,
})

function RootLayout() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineOverlay />
        <Outlet />
        {/* One toast portal for the whole app — inside the query provider so a
            toast action (e.g. "soften & retry") can drive a mutation */}
        <Toaster />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
