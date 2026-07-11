// apps/web/src/shared/ui/index.ts
// Public API of the v3 "Bioluminescent Terminal" design-system kit. Modules and
// routes import ONLY from 'shared/ui' — never from the individual component
// files. Component inventory + variants: docs/frontend/design.md §6.
export { AppErrorBoundary } from './AppErrorBoundary'
export { AppShell } from './AppShell'
export type { AppShellProps, AppShellUser } from './AppShell'
// The landing hero's animated ASCII ellipsoid (canvas, dependency-free)
export { AsciiSphere } from './AsciiSphere'
export type { AsciiSphereProps } from './AsciiSphere'
export { Badge } from './Badge'
export type { BadgeProps, BadgeVariant } from './Badge'
export { Button } from './Button'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'
// The v4 surface primitive: every panel in the app is a Card with a declared
// surface (glass / steel / well) instead of a hand-rolled border+padding string
export { Card } from './Card'
export type { CardPadding, CardProps, CardSurface } from './Card'
// The raw frosted recipes, for the rare surface that is NOT a Card — the composer
// capsule needs its own radius. Reach for `Card` first; these exist so nobody
// hand-copies the recipe a fifth time. Consumers add their own `border` + radius.
export { GLASS_FLOATING, GLASS_SURFACE, STEEL_SURFACE, WELL_SURFACE } from './surfaces'
export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'
export { ErrorState } from './ErrorState'
export type { ErrorStateProps } from './ErrorState'
export { Input } from './Input'
export type { InputProps } from './Input'
export { Modal } from './Modal'
export type { ModalProps } from './Modal'
// Action menu (fires and forgets) — the counterpart to Select (chooses and keeps)
export { Menu } from './Menu'
export type { MenuItem, MenuProps } from './Menu'
export { LangSwitch } from './LangSwitch'
export { NotFoundPage } from './NotFoundPage'
export { OfflineOverlay } from './OfflineOverlay'
export { PillGroup } from './PillGroup'
export type { PillGroupProps, PillOption } from './PillGroup'
// The kit's ONE dropdown: a WAI-ARIA listbox with rich rows (icon / badge /
// caption / description / meta). `glass` variant for the composer capsule.
export { Select } from './Select'
export type { SelectOption, SelectProps } from './Select'
// Its headless brain — exported for any bespoke popup that must match the
// keyboard contract without reusing the row rendering
export { useListbox } from './useListbox'
export type { ListboxPlacement } from './useListbox'
export { Progress } from './Progress'
export type { ProgressProps } from './Progress'
// Specimen art + the kind list so consumers can lay out the whole grid
export { SPECIMEN_KINDS, SpecimenTile } from './SpecimenTile'
export type { SpecimenKind, SpecimenTileProps } from './SpecimenTile'
export { Skeleton } from './Skeleton'
export type { SkeletonProps } from './Skeleton'
