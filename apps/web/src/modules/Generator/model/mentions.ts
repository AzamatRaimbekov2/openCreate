// apps/web/src/modules/Generator/model/mentions.ts
// MOVED to shared/libs/mentions.ts — CinemaStudio tags characters too (a film's
// shots carry a cast), and modules may not import each other, so the mention
// protocol had to become shared. This file is a thin re-export so the Generator's
// existing imports keep working and the move stays a non-event.
//
// The invariant itself is documented at the new home: entityRefs are DERIVED from
// the prompt text, never stored beside it.
export { deriveEntityRefs, entityPlaceholderToken, nextPlaceholder } from 'shared/libs/mentions'
