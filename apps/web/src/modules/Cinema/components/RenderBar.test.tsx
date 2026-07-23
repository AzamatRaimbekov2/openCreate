// apps/web/src/modules/Cinema/components/RenderBar.test.tsx
// Behavior of the export STATUS STRIP — CLIENT-side export (pure presentation;
// useExportController owns the state). Load-bearing: idle renders NOTHING (the
// trigger lives in the header); a running export shows progress + a CANCEL; a
// finished one confirms; a failure is a CALM retry (never raw encoder text); a
// BLOCKED film shows the named reason with NO retry; an UNSUPPORTED browser shows
// a calm note.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RenderBar } from './RenderBar'
import 'shared/config/i18n'

function baseProps() {
  return {
    state: 'idle' as 'idle' | 'running' | 'done' | 'error',
    progress: 0,
    blockedMessage: null as string | null,
    onShowSubject: null as (() => void) | null,
    unsupportedMessage: null as string | null,
    onCancel: vi.fn(),
    onRetry: vi.fn(),
  }
}

describe('RenderBar (client export strip)', () => {
  it('renders nothing while idle — the trigger lives in the header', () => {
    const { container } = render(<RenderBar {...baseProps()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a calm note when export is unsupported here', () => {
    render(<RenderBar {...baseProps()} unsupportedMessage="This browser can't export video here." />)
    expect(screen.getByRole('status')).toHaveTextContent(/can't export/i)
  })

  it('shows determinate progress and a CANCEL while running', async () => {
    const props = baseProps()
    render(<RenderBar {...props} state="running" progress={42} />)
    expect(screen.getByRole('status')).toHaveTextContent('42%')
    await userEvent.click(screen.getByRole('button', { name: /cancel|отмен/i }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('confirms when the export is done', () => {
    render(<RenderBar {...baseProps()} state="done" />)
    expect(screen.getByRole('status')).toHaveTextContent(/complete|saved|готов|сохран/i)
  })

  it('offers a calm retry on failure', async () => {
    const props = baseProps()
    render(<RenderBar {...props} state="error" />)
    await userEvent.click(screen.getByRole('button', { name: /try again|повторить/i }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('says the export was BLOCKED (named reason), with NO retry', () => {
    const props = baseProps()
    render(<RenderBar {...props} blockedMessage="Shot 2 is still generating — wait for it." />)
    expect(screen.getByRole('alert')).toHaveTextContent(/still generating/i)
    // A block is not a failure — no "try again" that cannot help.
    expect(screen.queryByRole('button', { name: /try again|повторить/i })).not.toBeInTheDocument()
  })

  it('offers a jump to the blocking shot when there is one', async () => {
    const onShowSubject = vi.fn()
    render(
      <RenderBar {...baseProps()} blockedMessage="Shot 2 is still generating." onShowSubject={onShowSubject} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /show me|показать/i }))
    expect(onShowSubject).toHaveBeenCalledOnce()
  })

  it('offers no jump when the blocker is not a shot', () => {
    render(<RenderBar {...baseProps()} blockedMessage="The Music track failed." />)
    expect(screen.queryByRole('button', { name: /show me|показать/i })).not.toBeInTheDocument()
  })
})
