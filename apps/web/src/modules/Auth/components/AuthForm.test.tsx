// apps/web/src/modules/Auth/components/AuthForm.test.tsx
// Behavior: email+password fields validate via zod (localized messages in alert
// regions), valid login submits through the auth client, server failures show a
// localized message in an alert region, the login↔register switch adds the name
// field and submits a registration, and the Google button is env-gated.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { AuthForm } from './AuthForm'
// i18n init — the form renders localized labels/messages itself
import 'shared/config/i18n'

// Auth actions are module-mocked: no real better-auth client, no network
const { signInEmail, signInSocial, signUpEmail, useAuthConfigMock } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  signUpEmail: vi.fn(),
  // Runtime provider flags: the Google button now follows the SERVER's config
  // (GET /api/auth/config) via useAuthConfig — not a build-time env flag.
  useAuthConfigMock: vi.fn(),
}))

vi.mock('../model/authClient', () => ({
  signIn: { email: signInEmail, social: signInSocial },
  signUp: { email: signUpEmail },
}))

vi.mock('../model/authConfig', () => ({
  useAuthConfig: useAuthConfigMock,
}))

// Fresh QueryClient per render — AuthForm invalidates ['me'] after success
function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<AuthForm />, { wrapper })
}

beforeEach(() => {
  signInEmail.mockReset().mockResolvedValue({ data: null, error: null })
  signUpEmail.mockReset().mockResolvedValue({ data: null, error: null })
  // Social sign-in resolves like the email actions: { error } is awaited and
  // surfaced in the banner (success normally navigates the page away).
  signInSocial.mockReset().mockResolvedValue({ data: null, error: null })
  // Default: Google disabled (server hasn't wired creds) → no button.
  useAuthConfigMock.mockReset().mockReturnValue({ data: { googleEnabled: false } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AuthForm', () => {
  it('shows zod validation errors and does not submit invalid values', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alerts = await screen.findAllByRole('alert')
    const text = alerts.map((a) => a.textContent).join(' ')
    expect(text).toMatch(/enter a valid email/i)
    expect(text).toMatch(/at least 8 characters/i)
    expect(signInEmail).not.toHaveBeenCalled()
  })

  it('submits login credentials through the auth client', async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInEmail).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123' })
  })

  it('expands a bare username to <name>@dev.local in dev builds', async () => {
    // The dev super-admin is admin@dev.local / "admin", but the muscle memory
    // (and Chrome's saved credential) is a bare "admin" — which zod rejected as
    // an invalid email, so the request never even left the browser and login
    // looked broken. In dev, a value with no "@" means the local dev domain.
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'admin')
    await userEvent.type(screen.getByLabelText('Password'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInEmail).toHaveBeenCalledWith({ email: 'admin@dev.local', password: 'admin' })
  })

  it('leaves a real email untouched in dev (the "@" rule only fires without one)', async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'admin@dev.local')
    await userEvent.type(screen.getByLabelText('Password'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInEmail).toHaveBeenCalledWith({ email: 'admin@dev.local', password: 'admin' })
  })

  it('does NOT expand a bare username in production builds', async () => {
    // The affordance is a dev convenience and must never ship: in prod a bare
    // username stays invalid and is rejected by the same zod rule as before.
    vi.stubEnv('DEV', false)
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'admin')
    await userEvent.type(screen.getByLabelText('Password'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/enter a valid email/i)
    expect(signInEmail).not.toHaveBeenCalled()
  })

  it('shows a localized server error in an alert region on failed login', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'raw server text', status: 401 },
    })
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    // Localized copy — never the raw server message (design.md §8)
    expect(alert).toHaveTextContent(/wrong email or password/i)
    expect(alert).not.toHaveTextContent('raw server text')
  })

  it('maps a sign-up conflict (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, 422) to actionable copy', async () => {
    // better-auth 1.6.x returns this exact code (NOT USER_ALREADY_EXISTS) on
    // sign-up with a taken email — the bug: it used to fall through to generic
    signUpEmail.mockResolvedValue({
      data: null,
      error: {
        code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
        message: 'User already exists. Use another email.',
        status: 422,
      },
    })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    // Localized, actionable copy — never the raw server text (design.md §8)
    expect(alert).toHaveTextContent(/already registered/i)
    expect(alert).not.toHaveTextContent('User already exists. Use another email.')
  })

  it('offers a switch-to-login shortcut on email conflict and flips the form to login', async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'raw', status: 422 },
    })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    // The inline affordance flips the form to login mode on click
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    // Login mode: submit is now "Sign in", the name field is gone, error cleared
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument()
  })

  it('maps a 422 sign-up conflict by HTTP status when the code is absent', async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { message: 'raw', status: 422 } })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already registered/i)
  })

  it('maps PASSWORD_TOO_SHORT to the password requirement copy', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'PASSWORD_TOO_SHORT', message: 'Password too short', status: 400 },
    })
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/at least 8 characters/i)
  })

  it('falls back to the generic message for unknown server error codes', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'SOME_UNKNOWN_CODE', message: 'weird internal detail', status: 500 },
    })
    renderForm()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not complete the action/i)
    expect(alert).not.toHaveTextContent('weird internal detail')
  })

  it('switches to register mode and submits name+email+password', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    // Register mode adds the name field and changes the submit label
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(signUpEmail).toHaveBeenCalledWith({
      email: 'ada@b.co',
      password: 'password123',
      name: 'Ada',
    })
    expect(signInEmail).not.toHaveBeenCalled()
  })

  it('requires a name in register mode', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    await userEvent.type(screen.getByLabelText('Email'), 'ada@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/enter your name/i)
    expect(signUpEmail).not.toHaveBeenCalled()
  })

  it('tints the submit pill red for log-in and green for sign-up (reference taxonomy)', async () => {
    renderForm()
    // Log in = the red specimen pill (auth-entry files under red in v3)
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('bg-specimen-red/20')
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    // Sign up = the green specimen pill (creating an account = a create action)
    expect(screen.getByRole('button', { name: 'Create account' })).toHaveClass(
      'bg-specimen-green/20',
    )
  })

  it('hides the Google button when the server has Google disabled', () => {
    useAuthConfigMock.mockReturnValue({ data: { googleEnabled: false } })
    renderForm()
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
  })

  it('hides the Google button while the config is still loading', () => {
    useAuthConfigMock.mockReturnValue({ data: undefined })
    renderForm()
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
  })

  it('shows the Google button when the server has Google enabled', async () => {
    useAuthConfigMock.mockReturnValue({ data: { googleEnabled: true } })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(signInSocial).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }))
  })

  it('shows a localized alert when Google sign-in fails instead of doing nothing', async () => {
    // The live bug: a failed social request (rate limit / misconfig) was
    // swallowed by a fire-and-forget call — the button looked dead. The error
    // must land in the same role="alert" banner as email sign-in failures.
    useAuthConfigMock.mockReturnValue({ data: { googleEnabled: true } })
    signInSocial.mockResolvedValue({
      data: null,
      error: { code: undefined, message: 'Too many requests', status: 429 },
    })
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not complete the action/i)
    expect(alert).not.toHaveTextContent('Too many requests')
  })
})
