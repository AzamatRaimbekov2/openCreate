// apps/web/src/shared/ui/Button.tsx
// Design-system button (v3 "Bioluminescent Terminal"): a translucent SPECIMEN
// PILL from the closed triad — never a solid opaque fill. Variant → tint:
// primary = green (create/submit), ghost = amber (explore/secondary),
// danger = red (destructive/auth-exit). Each pill is a /20 tint + white/10
// border + bright matching text + the one allowed soft double shadow.
// Sizes md/lg, loading state with inline spinner. docs/frontend/design.md §5.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  // Visible content of the button (label, optionally with an icon)
  children: ReactNode
  // Visual role: primary = the single main action, ghost = secondary/quiet, danger = destructive only
  variant?: ButtonVariant
  // sm for dense tool chrome (editor toolbars), md for regular UI; lg reserved
  // for landing/hero CTAs
  size?: ButtonSize
  // Shows the inline spinner and disables the button while an async action runs
  isLoading?: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

// The specimen triad (closed system — max three button tints, no solid fills):
// hover deepens the same tint one step (/30) so the pill glows brighter without
// ever leaving its color. Text: green pills use the glow-green itself; amber and
// red pills use their near-white lumen foregrounds (reference pill anatomy).
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-specimen-green/20 text-glow-green hover:bg-specimen-green/35',
  ghost: 'bg-specimen-amber/20 text-lumen-amber hover:bg-specimen-amber/35',
  danger: 'bg-specimen-red/20 text-lumen-red hover:bg-specimen-red/35',
}

// md keeps the 40px hit area from the a11y rules; sm (32px) matches the v3.1
// compact chrome scale (AppShell controls) and is reserved for pointer-first
// tool surfaces where density buys canvas space — never for primary page CTAs
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-4 py-1 text-xs',
  md: 'min-h-10 px-5 py-2 text-sm',
  lg: 'min-h-12 px-7 py-3 text-base',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  type = 'button',
  disabled = false,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      // Loading is a disabled state too — double submits are never possible
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      // Pill silhouette (rounded-full) + white/10 border + shadow-pill: the
      // ONLY shadow the design law allows. font-medium (500) is the weight
      // ceiling — nothing in the app renders bolder.
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/10 font-medium shadow-pill transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  )
}

// Inline spinner — decorative (aria-hidden); the button itself announces aria-busy
function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      data-testid="button-spinner"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
