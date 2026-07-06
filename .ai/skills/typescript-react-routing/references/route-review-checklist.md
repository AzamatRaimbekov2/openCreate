# TypeScript Route Review Checklist

Use this before completing React routing work:

1. Are all new route files `.tsx` or `.ts`?
2. Is each new screen reachable through route config or file-system routing?
3. Are navigation, breadcrumbs, redirects, and tests using central route helpers where available?
4. Are route params and search params typed or validated at the boundary?
5. Is addressable state represented in the URL?
6. Is the route/page file under 200 lines?
7. Are loading, empty, and error states present for data routes?
8. Did typecheck and a route navigation smoke test run?
