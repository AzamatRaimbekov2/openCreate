// apps/web/src/shared/ui/Skeleton.tsx
// Loading placeholder — a pulsing block shaped by the caller to mirror the
// eventual content (the 4-states rule bans bare spinners for data surfaces).
export type SkeletonProps = {
  // Shape/size utilities from the caller, e.g. "h-4 w-32" or "aspect-square w-full"
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  // aria-hidden: skeletons are decorative; the surface announces loading elsewhere
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-ink/10 ${className}`} />
}
