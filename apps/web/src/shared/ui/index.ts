// apps/web/src/shared/ui/index.ts
// Public API of the v3 "Bioluminescent Terminal" design-system kit. Modules and
// routes import ONLY from 'shared/ui' — never from the individual component
// files. Component inventory + variants: docs/frontend/design.md §6.
export { AccountMenu } from './AccountMenu'
export type { AccountMenuProps, AccountUser } from './AccountMenu'
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
// The prompt-enhancer affordance: a sparkle icon inside a prompt field (enhance +
// undo + calm error notice + once-per-session idle nudge). Shared by the /create
// composer and the Cinema shot prompt over the shared/model enhance layer.
export { EnhanceButton, ENHANCE_NUDGE_IDLE_MS, MIN_ENHANCE_LENGTH } from './EnhanceButton'
export type { EnhanceButtonProps } from './EnhanceButton'
export { ErrorState } from './ErrorState'
export type { ErrorStateProps } from './ErrorState'
export { Input } from './Input'
export type { InputProps } from './Input'
export { Modal } from './Modal'
export type { ModalProps } from './Modal'
// Action menu (fires and forgets) — the counterpart to Select (chooses and keeps)
export { Menu } from './Menu'
export type { MenuItem, MenuProps } from './Menu'
// The inline "@" mention popup — shared by the /create composer and the Cinema
// shot composer (strings and anchor arrive as props; caret math lives in
// shared/libs/mentionQuery)
export { MentionAutocomplete } from './MentionAutocomplete'
export type { MentionAutocompleteProps, MentionItem } from './MentionAutocomplete'
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
export { ProviderMark } from './ProviderMark'
export type { ProviderMarkProps } from './ProviderMark'
export { Skeleton } from './Skeleton'
export type { SkeletonProps } from './Skeleton'
// The app's ONE blocking spend gate. It moved here from Assets3D (2026-08-20,
// ADR shorts-studio §4) when the Shorts batch became the second paid batch
// surface: a module may not import another module's internals, and the last
// thing this app should own two copies of is the dialog that guards credits.
export { SpendConfirmModal } from './SpendConfirmModal'
export type { SpendConfirmModalProps } from './SpendConfirmModal'
// Toast system: the imperative `toast` API + the <Toaster> portal (mounted once
// in the shell root). Any module notifies through `toast`; the store is exported
// for tests and the rare consumer that needs to read the live stack directly.
export { Toaster } from './Toaster'
export { toast } from './toast'
export { useToastStore } from './toastStore'
export type { Toast, ToastAction, ToastInput, ToastVariant } from './toastStore'
