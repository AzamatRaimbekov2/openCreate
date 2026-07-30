// apps/web/src/modules/Creator/model/planState.ts
// The money rule of the creator chat, isolated as one pure function: WHEN may a
// plan card's «Подтвердить» button be clicked?
//
// WHY IT IS NOT INSIDE THE CARD: a plan card cannot answer this from its own
// content. Whether it is still the live gate depends on the session status AND on
// what came after it in the transcript — a second plan supersedes the first, and
// confirming a superseded budget would authorize a number the agent has already
// replaced. Only the chat sees the whole story, so the chat decides and the card
// renders. Pure and exported so the rule is tested without a DOM.
import type { CreatorMessage, CreatorSessionStatus } from '@opencreate/contracts'

// live     — this plan IS the gate the session is blocked on: the button works.
// answered — something followed it (the server's confirmation line, or the user's
//            next message, or a newer plan). The transcript below already tells
//            the user what happened, so the card makes no claim of its own.
// stale    — the gate is gone and nothing followed: the turn died holding this
//            plan (provider failure, the 10-minute stale reaper). The card says
//            so and points at the way out.
export type PlanState = 'live' | 'answered' | 'stale'

export function planStateFor(
  messages: readonly CreatorMessage[],
  index: number,
  sessionStatus: CreatorSessionStatus,
): PlanState {
  // Anything after this plan means the conversation moved on. Ordering is the
  // server's (created_at, rowid) — the array order is authoritative and is never
  // re-sorted here.
  if (index < messages.length - 1) return 'answered'
  return sessionStatus === 'awaiting_confirm' ? 'live' : 'stale'
}
