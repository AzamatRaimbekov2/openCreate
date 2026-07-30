// The confirm gate for a branch run (ADR canvas-mode D5: spend stays explicit).
// What is pinned here is the money contract of the dialog:
//   * every node about to be charged is listed, with its model and its price;
//   * the TOTAL is restated where the user's eye is going (the confirm pill);
//   * an unpriceable plan cannot be confirmed — a null price is not a price;
//   * a blocked plan explains itself instead of offering a run button;
//   * confirming calls back exactly once.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BranchPlan } from '../model/useRunBranch'
import { RunBranchDialog } from './RunBranchDialog'
import 'shared/config/i18n'

const PLAN: Extract<BranchPlan, { ok: true }> = {
  ok: true,
  nodeIds: ['a', 'b'],
  items: [
    { nodeId: 'a', kind: 'image', modelName: 'Studio', credits: 2 },
    { nodeId: 'b', kind: 'video', modelName: 'Motion', credits: 19 },
  ],
  total: 21,
}

function renderDialog(plan: BranchPlan, onConfirm = vi.fn()) {
  const onClose = vi.fn()
  render(<RunBranchDialog isOpen plan={plan} onClose={onClose} onConfirm={onConfirm} />)
  return { onConfirm, onClose }
}

describe('RunBranchDialog', () => {
  it('itemizes every node that will be charged, with its model and price', () => {
    renderDialog(PLAN)
    expect(screen.getByText('Studio')).toBeInTheDocument()
    expect(screen.getByText('Motion')).toBeInTheDocument()
    expect(screen.getByText('2 cr')).toBeInTheDocument()
    expect(screen.getByText('19 cr')).toBeInTheDocument()
  })

  it('restates the total on the confirm pill, where the click is aimed', async () => {
    const { onConfirm } = renderDialog(PLAN)
    const confirm = screen.getByRole('button', { name: /21 cr/ })
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cannot be confirmed when a row has no price (never invent a number)', () => {
    renderDialog({
      ok: true,
      nodeIds: ['a'],
      items: [{ nodeId: 'a', kind: 'image', modelName: null, credits: null }],
      total: null,
    })
    expect(screen.getByRole('button', { name: /run branch/i })).toBeDisabled()
  })

  it('explains a blocked plan instead of offering a run', () => {
    renderDialog({ ok: false, nodeId: 'a', reason: 'config' })
    expect(screen.getByText(/needs a prompt and a model/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /run branch/i })).not.toBeInTheDocument()
  })

  it('says so when there is nothing left to run', () => {
    renderDialog({ ok: false, nodeId: 'a', reason: 'nothingToRun' })
    expect(screen.getByText(/already up to date/i)).toBeInTheDocument()
  })

  it('offers a cancel that closes without spending', async () => {
    const { onClose, onConfirm } = renderDialog(PLAN)
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
