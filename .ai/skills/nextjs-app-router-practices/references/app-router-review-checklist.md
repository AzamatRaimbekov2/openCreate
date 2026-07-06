# Next.js App Router Review Checklist

Use this when reviewing or finishing App Router work:

1. Was Next.js necessary, or is the project already Next.js?
2. Are pages/layouts Server Components unless they need client interactivity?
3. Is `"use client"` placed at the smallest possible boundary?
4. Are route groups, nested layouts, and colocation used intentionally?
5. Are `loading.tsx`, `error.tsx`, and `not-found.tsx` present where route data can fail or load slowly?
6. Are `params` and `searchParams` typed for the installed Next.js version?
7. Is metadata defined for SEO-visible pages?
8. Are page/client component files under 200 lines?
9. Did typecheck, lint/build, and browser smoke checks run?
