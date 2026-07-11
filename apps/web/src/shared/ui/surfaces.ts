// apps/web/src/shared/ui/surfaces.ts
// The ONE source of truth for the v4 surface language (docs/frontend/design.md §3).
// Before v4 the frosted recipe was duplicated in Modal (the media sheet) and Select
// (the composer capsule trigger); a third copy would have guaranteed drift. Card,
// Modal and Select now all read from here.
//
// GLASS, and why it is written the way it is:
//   * `bg-steel` is the BASELINE, not a fallback afterthought. Everything frosted is
//     layered behind `supports-[backdrop-filter]:`, so a browser without
//     backdrop-filter renders an opaque steel card instead of unreadable haze.
//   * `backdrop-blur` only does visible work when there is TEXTURE behind the card
//     (media, thumbnails, a dimmed page under a modal). Over the flat void it is a
//     no-op by definition — blurring a uniform fill returns the same fill. The
//     translucent wash + hairline + shadow carry the look there.
//   * The specular edge is a brighter TOP BORDER (`border-t-white/25`), never a
//     gradient sheen: no-gradient remains a hard owner rule in v4.

// The frosted material itself, WITHOUT an elevation. Never used directly: pick an
// elevation below. Consumers supply their own `border` width and radius.
const GLASS_MATERIAL = [
  'border-white/15 bg-steel',
  'supports-[backdrop-filter]:bg-white/[0.06]',
  'supports-[backdrop-filter]:backdrop-blur-2xl',
  // Saturate: a blur washes colour out and the panel goes grey and dead
  'supports-[backdrop-filter]:backdrop-saturate-150',
  // Brightness: buy text contrast from the BACKDROP rather than from an opaque
  // fill — dim what is behind the glass instead of covering it
  'supports-[backdrop-filter]:backdrop-brightness-75',
  // A bright top border fakes the specular edge of a real lens; a uniform
  // hairline reads as a flat outline. This is the no-gradient answer to a sheen.
  'supports-[backdrop-filter]:border-white/10',
  'supports-[backdrop-filter]:border-t-white/25',
  // The inner glass wall under that edge
  'supports-[backdrop-filter]:ring-1 supports-[backdrop-filter]:ring-white/5 supports-[backdrop-filter]:ring-inset',
].join(' ')

// Resting elevation — cards and modal sheets.
export const GLASS_SURFACE = `${GLASS_MATERIAL} shadow-glass`

// Floating elevation — chrome that hovers OVER scrolling content (the composer
// capsule). Same material, longer throw, so it separates from the feed beneath
// it. Two named elevations beat a bespoke `shadow-2xl shadow-black/50` per site:
// Tailwind resolves competing shadow utilities by stylesheet order, not class
// order, so "GLASS_SURFACE plus my own shadow" is not a thing a consumer can do.
export const GLASS_FLOATING = `${GLASS_MATERIAL} shadow-glass-lg`

// Opaque working surface — text-heavy dialogs, anything that must stay legible
// over a busy backdrop (a popup panel is opaque on purpose; see Select).
export const STEEL_SURFACE = 'border-white/10 bg-steel'

// Recessed well — media plates and sunken rails the content sits INSIDE.
export const WELL_SURFACE = 'border-white/10 bg-abyss'
