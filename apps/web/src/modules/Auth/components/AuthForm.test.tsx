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
const { signInEmail, signInSocial, signUpEmail } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  signUpEmail: vi.fn(),
}))

vi.mock('../model/authClient', () => ({
  signIn: { email: signInEmail, social: signInSocial },
  signUp: { email: signUpEmail },
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
  signInSocial.mockReset()
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

  it('hides the Google button unless VITE_GOOGLE_AUTH is "1"', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
  })

  it('shows the Google button when VITE_GOOGLE_AUTH is "1"', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH', '1')
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(signInSocial).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }))
  })
})
