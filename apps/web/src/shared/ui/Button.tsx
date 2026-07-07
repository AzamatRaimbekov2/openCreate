// apps/web/src/shared/ui/Button.tsx
// Design-system button ("Light Editorial"): a solid-ink pill whose hover flips
// to the vermillion accent — the editorial CTA gesture. Variants: primary
// (solid ink), ghost (hairline outline, quiet), danger (destructive only).
// Sizes md/lg, loading state with inline spinner. docs/frontend/design.md §5.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

export type ButtonProps = {
  // Visible content of the button (label, optionally with an icon)
  children: ReactNode
  // Visual role: primary = the single main action, ghost = secondary/quiet, danger = destructive only
  variant?: ButtonVariant
  // md for regular UI; lg reserved for landing/hero CTAs
  size?: ButtonSize
  // Shows the inline spinner and disables the button while an async action runs
  isLoading?: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

// Editorial variants: the primary CTA is solid ink (the "printed" button) and
// hovers to vermillion — the accent appears as a reaction, not a default.
// Ghost is a hairline-outline pill (quiet, secondary); danger stays a solid
// fill so destructive actions are unmistakable, in the deeper danger red that
// never competes with the vermillion accent.
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-cream hover:bg-vermillion',
  ghost: 'border border-ink/25 bg-transparent text-ink hover:border-ink hover:bg-sand',
  danger: 'bg-danger text-cream hover:bg-danger/85',
}

// min-h keeps the 40px minimum hit area from the a11y rules
const sizeClasses: Record<ButtonSize, string> = {
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
      // Pill shape (rounded-full) is the editorial control silhouette;
      // transition-colors at 200ms makes the ink→vermillion hover FELT (brief:
      // "hover states must be felt", motion window 150–250ms)
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
