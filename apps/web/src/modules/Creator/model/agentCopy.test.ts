// A failed agent turn lands an ENGLISH sentence in the transcript (the service
// sanitizes its own infrastructure failures into three fixed strings). This app
// speaks Russian, and frontend-error-ux forbids untranslated backend text as
// user-facing copy — so the closed set is mapped to i18n keys, and the agent's
// own prose (which the model already writes in Russian) passes through untouched.
import { describe, expect, it } from 'vitest'
import { agentTextKey } from './agentCopy'

describe('agentTextKey', () => {
  it('localizes "not configured" — an operator misconfiguration, not the user', () => {
    expect(agentTextKey('The creator agent is not configured')).toBe(
      'creator.agentText.notConfigured',
    )
  })

  it('localizes "temporarily unavailable" — every provider in the chain is down', () => {
    expect(agentTextKey('The creator agent is temporarily unavailable')).toBe(
      'creator.agentText.unavailable',
    )
  })

  it('localizes the generic turn failure', () => {
    expect(agentTextKey('The agent turn failed')).toBe('creator.agentText.turnFailed')
  })

  it('lets the agent’s own prose through — it is already in the user’s language', () => {
    expect(agentTextKey('Готово, холст собран.')).toBeNull()
  })

  it('does not match on a substring — only the exact sentinel is server copy', () => {
    // A model that quotes the phrase inside a longer answer is writing prose,
    // not reporting infrastructure; swapping that for the failure notice would
    // put a wrong explanation over a healthy turn.
    expect(agentTextKey('Похоже, что The agent turn failed — попробуем ещё раз')).toBeNull()
  })
})
