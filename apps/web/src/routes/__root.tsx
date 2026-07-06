// apps/web/src/routes/__root.tsx
// Root route: wraps every screen with the global providers (TanStack Query,
// i18n side-effect init). Error-UX surfaces (crash boundary, offline overlay,
// 404) are wired here in Task 13.
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from 'shared/config/queryClient'
import 'shared/config/i18n'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}
