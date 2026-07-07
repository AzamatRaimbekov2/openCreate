// apps/web/src/shared/ui/Skeleton.tsx
// Loading placeholder — a cream-shimmer block shaped by the caller to mirror
// the eventual content (the 4-states rule bans bare spinners for data
// surfaces). The pulse runs on the sand tint, so loading reads as "unprinted
// paper" instead of the generic gray block the v1 design was rejected for.
export type SkeletonProps = {
  // Shape/size utilities from the caller, e.g. "h-4 w-32" or "aspect-square w-full"
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  // aria-hidden: skeletons are decorative; the surface announces loading elsewhere
  return <div aria-hidden="true" className={`animate-pulse rounded-sm bg-sand ${className}`} />
}
