// apps/web/src/modules/Creator/model/agentCopy.ts
// The one place that knows which assistant text is SERVER copy and which is the
// agent's own prose.
//
// WHY THIS EXISTS: when a turn dies of infrastructure (no provider configured,
// every provider down, an unexpected throw), the service appends a sanitized
// assistant message so the failure is visible IN the conversation instead of as
// a silent status flip. Those sanitized strings are English literals — see
// apps/api/src/modules/creator/{brain,service}.ts — and this product speaks
// Russian. Rendering them verbatim would break the frontend-error-ux rule that
// user-facing copy is never an untranslated backend string.
//
// Everything else the agent writes is already in the user's language (the system
// prompt instructs it to answer in Russian), so it passes through untouched. The
// mapping is EXACT-MATCH only: a model quoting one of these phrases inside a
// longer answer is writing prose, and swapping that for a failure notice would
// put a wrong explanation over a perfectly healthy turn.
//
// Mirrors shared/libs/errorCopy.ts: a closed table of machine-produced text →
// i18n keys, with a safe pass-through for anything unrecognized.
const AGENT_TEXT_KEYS: Record<string, string> = {
  'The creator agent is not configured': 'creator.agentText.notConfigured',
  'The creator agent is temporarily unavailable': 'creator.agentText.unavailable',
  'The agent turn failed': 'creator.agentText.turnFailed',
}

// Returns an i18n key when the text is one of the server's sanitized sentinels,
// or null when it is the agent's own words (render them as they are).
export function agentTextKey(text: string): string | null {
  return AGENT_TEXT_KEYS[text] ?? null
}
