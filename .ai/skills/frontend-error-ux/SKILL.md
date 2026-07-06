---
name: frontend-error-ux
description: "Use when initializing, creating, reviewing, or fixing frontend projects and user-facing failure states: required startup audits for 404 pages, error modals, offline no-internet blockers, crash fallbacks, error boundaries, API failures, form/business warnings, HTTP 4xx/5xx display, and safe incident messaging in web apps."
---

# Frontend Error UX

## Purpose

Make every user-facing failure state calm, useful, and non-technical. Users should see a clear product state and a next action; technical detail belongs in logs, monitoring, support metadata, and developer tools.

## Mandatory Startup Audit

When a frontend project is initialized or onboarded, run this skill immediately after the project wiki and `frontend-agent` startup checks, before normal feature work.

The startup audit must inspect the current app and record whether these surfaces exist:

1. Custom 404 / Not Found page for unknown routes.
2. User-facing error modal/dialog pattern for blocking or high-importance failures.
3. Root-level crash fallback for white-screen and uncaught runtime failures.
4. App-level offline screen-blocking overlay/modal when the user loses internet connection.

If any surface is missing and the task allows source changes, add tests first, then implement the smallest project-fitting version. If source changes are out of scope, document the gap in `docs/wiki/`, `docs/frontend/screens.md`, or the nearest `FEATURE.md`.

## Core Rules

- Always provide a designed 404 page for unknown routes. A missing page must never become a blank screen, raw router error, server error, or default framework page.
- Always provide a root-level crash fallback for broken pages, uncaught render/runtime failures, chunk load failures, and white-screen scenarios.
- Always provide a reusable error modal/dialog pattern for blocking failures that require user acknowledgement or a retry/navigation decision.
- Always provide an offline blocker for lost connectivity. If `navigator.onLine` is false or the browser emits `offline`, show a modal or full-screen overlay that blocks network-dependent actions and says the user has no internet connection.
- Never show raw server text: `Bad Gateway`, `Internal Server Error`, `500`, `502`, `503`, stack traces, exception names, request payloads, SQL messages, provider messages, or untranslated backend strings.
- Do not make failure UI visually alarming. Avoid red as the primary color, destructive icons, "Error" headings, emergency wording, and blame language.
- Preserve the product language. For Russian products, write in Russian; for English products, write in English. Do not mix languages in one message.
- Keep exact diagnostics outside the UI: log status code, error code, request id, route, component, and stack trace to the existing observability system.

## User Copy Policy

Use short text that explains what the user can do next:

| Situation | Russian copy | English copy |
| --- | --- | --- |
| Offline / no internet | "Нет соединения с интернетом. Проверьте подключение, и мы продолжим автоматически." | "No internet connection. Check your connection, and we will continue automatically." |
| 404 / unknown route | "Страница не найдена. Перейдите на главную или проверьте ссылку." | "Page not found. Go to the home page or check the link." |
| Full-page crash or white screen fallback | "Идет техническое обновление. Обновите страницу или перейдите на главную." | "A technical update is in progress. Refresh the page or go to the home page." |
| Failed data load | "Не удалось загрузить данные. Попробуйте обновить страницу." | "We could not load the data. Try refreshing the page." |
| Retryable action failure | "Не получилось выполнить действие. Попробуйте еще раз." | "We could not complete the action. Please try again." |
| Wrong login or password | "Неверный логин или пароль. Проверьте данные и попробуйте снова." | "Incorrect login or password. Check the details and try again." |
| Business warning | "Проверьте условия действия и попробуйте снова." | "Check the action requirements and try again." |

Only mention support when the product already has a support path. Do not invent support channels.

## Mandatory 404 Page

Every frontend project must include a designed 404 page before initialization work is considered complete.

- Wire it through the router/framework: TanStack Router not-found route, React Router `path="*"`, Next.js `not-found.tsx`, Remix `CatchBoundary`, Vue Router catch-all, SvelteKit `+error.svelte`, or the local equivalent.
- Keep the page calm and useful: title, short explanation, button/link to home, optional back button, and no technical status dump.
- Verify direct navigation to an unknown URL, refresh on an unknown URL, and deep links after deployment routing rules.

## Mandatory Error Modal

Every frontend project must have a reusable error modal/dialog pattern for blocking failures.

- Prefer an existing design-system modal/dialog component; otherwise add the smallest accessible modal primitive that fits the project.
- Use it for failures where the user must acknowledge, retry, refresh, return home, sign in again, or stop a blocked action.
- Do not render raw backend messages in the modal. Use normalized user-safe categories and localized copy.
- Add accessible semantics: `role="dialog"` or `role="alertdialog"` when immediate acknowledgement is required, focus management, escape/close behavior when safe, and non-overflowing responsive layout.
- Keep non-blocking failures as inline messages, banners, or toasts when a modal would interrupt the workflow unnecessarily.

## Mandatory Offline Blocker

Every frontend project must show a no-internet blocker when connectivity is lost.

- Monitor initial state with `navigator.onLine` and subscribe to browser `online` and `offline` events.
- Show a modal or full-screen overlay that blocks network-dependent actions while offline.
- The blocker must clearly say there is no internet connection and should remove itself automatically when connectivity returns.
- Do not blame the user or mention internal network/proxy/provider details.
- If the product intentionally supports offline editing, still show persistent offline status and block only network-dependent actions; document that exception.
- Verify by emulating offline mode in the browser/devtools or test environment, then restoring the connection.

## Implementation Checklist

1. Find all user-visible error surfaces: route fallbacks, error boundaries, API clients, query/mutation errors, toasts, banners, forms, modals, auth/payment flows, and localization files.
2. Create or verify the 404 page and unknown-route wiring.
3. Create or verify the reusable error modal/dialog pattern.
4. Create or verify root-level crash fallback and global error hook/listener for white-screen failures.
5. Create or verify the offline screen-blocking overlay/modal using `navigator.onLine` plus `online`/`offline` events.
6. Add a single error-normalization layer if the project lacks one. Include `offline`, `service-temporary`, `interface-update`, `page-missing`, `load-failed`, `action-failed`, `input-invalid`, `business-warning`, and `unauthorized` as needed.
7. Ensure API clients and query libraries never pass raw backend messages directly to visible UI.
8. Make messages accessible with `role="status"` for non-blocking messages and `role="alert"` or `role="alertdialog"` only when immediate attention is required.
9. Verify responsive layouts so fallback text, buttons, overlays, and modals do not overlap or overflow.
10. Test at least: unknown route/404, direct refresh on 404, error modal display, offline blocker display/auto-dismiss, 500/502/503 response, network timeout, rejected promise, component render crash, failed route loader, failed mutation, invalid credentials, and form/business validation.

## Review Checklist

- Unknown routes render a custom 404 page with home navigation.
- Blocking failures can render a safe, accessible error modal/dialog.
- Lost internet connection renders a modal or full-screen blocker with "Нет соединения с интернетом" or the product-language equivalent.
- The offline blocker clears when connectivity returns.
- Full-page crashes render a safe fallback with refresh and home navigation.
- A root boundary or framework equivalent exists above pages/routes; white screens are not accepted.
- No visible `error.message`, backend `message`, stack trace, status text, or status code.
- No bright red primary styling for failure states.
- Developers still get full technical detail through logging, monitoring, and test output.
