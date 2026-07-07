// apps/web/src/modules/Landing/index.ts
// Public API of the Landing module — routes import ONLY from 'modules/Landing'.
// PriceTable is exported alongside the page because the /pricing route (plan
// Task 20) reuses the same honest comparison card.
export { LandingPage } from './components/LandingPage'
export type { LandingPageProps } from './components/LandingPage'
// The /pricing route composes both tables around its own catalog query
export { ModelCreditTable } from './components/ModelCreditTable'
export type { ModelCreditTableProps } from './components/ModelCreditTable'
export { PriceTable } from './components/PriceTable'
export type { PriceTableProps } from './components/PriceTable'
// The editorial section header (ordinal + kicker + serif h2) — exported so the
// /pricing route can run the same "index" section treatment as the landing
export { SectionHeading } from './components/SectionHeading'
export type { SectionHeadingProps } from './components/SectionHeading'
