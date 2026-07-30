// apps/web/src/modules/Canvas/model/types.ts
// Editor-side types over the wire contracts. The STORE holds contract shapes
// (CanvasNode/CanvasEdge) as the single source of truth; React Flow objects
// are DERIVED per render in CanvasEditor — never stored.
import type { AspectRatio, CanvasNodeKind } from '@opencreate/contracts'

// What a node's latest run is doing — drives the status border.
export type NodeRunStatus = 'idle' | 'processing' | 'succeeded' | 'failed'

// The subset of catalog data a node composer needs (flows via the ROUTE seam —
// Canvas may not import modules/Generator).
export type CanvasModelOption = {
  id: string
  name: string
  providerLabel: string
  type: 'image' | 'video'
  // Baseline price: an image model's flat cost, a video model's cheapest
  // duration. What the node CHARGES for a video is creditsByDuration[duration]
  // — the chip reads that first so the price on the card is the price billed.
  credits: number
  aspectRatios: AspectRatio[]
  durationOptions?: number[]
  creditsByDuration?: Record<string, number>
  // Can this model condition on a reference image at all (catalog
  // `referenceMode`)? Absent/null = tagging is impossible on it, so a node with
  // a character wire must not offer it — the server refuses such a request with
  // a 400 before charging, and a picker that offers a guaranteed refusal is a
  // promise the product does not keep (the ModelSelect precedent).
  referenceMode?: 'portrait' | 'subject' | 'both' | null
}

// The slice of an Entity a character node needs (flows via the ROUTE seam —
// Canvas may not import modules/Entities, exactly as it may not import
// modules/Generator for the catalog). `imageUrl` is the entity's PRIMARY
// reference photo: the face is what identifies the character on a board where
// several cards are visible at once, so it travels with the name.
export type CanvasEntityOption = {
  id: string
  name: string
  imageUrl: string | null
}

// Media-producing kinds — the only legal sources of a media wire. Video is
// TERMINAL in MVP: its output feeds nothing (image/operation inputs need an
// image; chaining video→video is out of scope).
export const MEDIA_SOURCE_KINDS: readonly CanvasNodeKind[] = [
  'image',
  'upload',
  'upscale',
  'remove-bg',
]

// Kinds that accept a media input at all (≤1 for image/video, =1 for ops).
export const MEDIA_TARGET_KINDS: readonly CanvasNodeKind[] = [
  'image',
  'video',
  'upscale',
  'remove-bg',
]
