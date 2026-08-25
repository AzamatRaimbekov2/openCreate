// apps/web/src/modules/Analytics/index.ts
// Public API of the Analytics module — routes import ONLY from
// 'modules/Analytics'. Internal files (model/, components/) are private.
//
// ADR: docs/wiki/decisions/analytics.md
export { AdminDashboard } from './components/AdminDashboard'
export type { AdminDashboardProps } from './components/AdminDashboard'
// The user-facing half: credits only, no provider cost, no margin.
export { MyUsage } from './components/MyUsage'
// Optional cookieless product telemetry. Renders nothing and loads nothing
// unless the deployment set ANALYTICS_SCRIPT_URL + ANALYTICS_SITE_DOMAIN.
export { useTelemetry } from './model/useTelemetry'
