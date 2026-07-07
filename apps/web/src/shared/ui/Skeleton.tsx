// apps/web/src/shared/ui/Skeleton.tsx
// Loading placeholder — a solid block shaped by the caller to mirror the
// eventual content (the 4-states rule bans bare spinners for data surfaces).
// v3 terminal: the pulse is a STEPPED walk up and down the surface ladder
// (abyss → steel → ridge → steel), defined as --animate-skeleton in theme.css.
// A stepped SOLID pulse, deliberately not a shimmer: the design law bans
// gradients everywhere, including gradient shimmer sweeps.
export type SkeletonProps = {
  // Shape/size utilities from the caller, e.g. "h-4 w-32" or "aspect-square w-full"
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  // aria-hidden: skeletons are decorative; the surface announces loading elsewhere.
  // bg-steel is the resting frame so the block is visible even before the
  // animation's first step (and if animations are disabled by the OS).
  return <div aria-hidden="true" className={`animate-skeleton rounded-lg bg-steel ${className}`} />
}
