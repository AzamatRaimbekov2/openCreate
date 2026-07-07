// apps/web/src/modules/Auth/components/AuthForm.tsx
// Email/password login-or-register form (v3 terminal: printed directly on the
// void, steel input fields, mono weight-400 heading).
// One component serves both modes: switching remounts the fields (key={mode})
// so RHF state, zod errors and the server alert reset predictably. Server
// failures surface as LOCALIZED copy in a role="alert" banner — never raw text.
import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Input } from 'shared/ui'
import { signIn, signUp } from '../model/authClient'

type AuthMode = 'login' | 'register'

// Zod = the single source of truth for validation. Messages are i18n KEYS —
// translated where rendered so the copy follows the active locale live.
const loginSchema = z.object({
  // Present in both modes so the inferred type is identical; login ignores it
  name: z.string(),
  email: z.email('auth.errors.email'),
  // Mirrors the API's better-auth minimum (8 chars)
  password: z.string().min(8, 'auth.errors.password'),
})

// Register additionally requires a display name (better-auth signUp needs it)
const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1, 'auth.errors.name'),
})

type AuthFormValues = z.infer<typeof loginSchema>

// Map better-auth error codes to safe localized copy (design.md §8: never raw
// server text). Anything unknown falls back to the generic action-failed line.
function serverErrorKeyFor(code: string | undefined): string {
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'auth.errors.invalidCredentials'
  if (code === 'USER_ALREADY_EXISTS') return 'auth.errors.emailTaken'
  return 'errors.actionFailed'
}

export function AuthForm() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>('login')
  const isLogin = mode === 'login'
  return (
    // No card — the form is printed directly on the void (the split's
    // manifesto panel provides the structure), opened by a mono weight-400
    // 30px heading over the standard white/10 hairline (v3 heading law)
    <section className="flex w-full max-w-md flex-col gap-8">
      <h1 className="border-b border-white/10 pb-5 text-3xl font-normal text-white">
        {t(isLogin ? 'auth.signIn' : 'auth.signUp')}
      </h1>
      {/* key={mode}: a mode switch is a new form — old errors must not linger */}
      <AuthFields key={mode} mode={mode} />
      {/* Mode switch is prose navigation → portal blue, the sanctioned
          prose-link color (v3 §2) */}
      <button
        type="button"
        onClick={() => setMode(isLogin ? 'register' : 'login')}
        className="min-h-10 self-start text-sm font-medium text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {t(isLogin ? 'auth.switchToRegister' : 'auth.switchToLogin')}
      </button>
    </section>
  )
}

// Private fields+submit component — remounted per mode by the parent
function AuthFields({ mode }: { mode: AuthMode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // Server-side failure as an i18n key ('' state impossible: null = no error)
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(mode === 'login' ? loginSchema : registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = async (values: AuthFormValues) => {
    setServerErrorKey(null)
    // better-auth returns { data, error } instead of throwing
    const result =
      mode === 'login'
        ? await signIn.email({ email: values.email, password: values.password })
        : await signUp.email({
            email: values.email,
            password: values.password,
            name: values.name.trim(),
          })
    if (result.error) {
      setServerErrorKey(serverErrorKeyFor(result.error.code))
      return
    }
    // Fresh session → the shared ['me'] profile/balance must refetch; the
    // login route reacts to the session change and redirects to /create
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const handleGoogleSignIn = () => {
    // Full-page OAuth redirect; better-auth brings the user back to /create
    void signIn.social({ provider: 'google', callbackURL: '/create' })
  }

  return (
    // noValidate: zod owns validation — native bubbles would preempt our messages
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {mode === 'register' ? (
        <Input
          label={t('auth.name')}
          autoComplete="name"
          error={errors.name ? t(errors.name.message ?? 'errors.actionFailed') : undefined}
          {...register('name')}
        />
      ) : null}
      <Input
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        error={errors.email ? t(errors.email.message ?? 'errors.actionFailed') : undefined}
        {...register('email')}
      />
      <Input
        label={t('auth.password')}
        type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        error={errors.password ? t(errors.password.message ?? 'errors.actionFailed') : undefined}
        {...register('password')}
      />
      {serverErrorKey ? (
        // Inline non-blocking failure banner (design.md §8); alert = announced.
        // v3 treatment: a calm steel surface block with a glow-red left rule —
        // red stays on the rule + text (the failure STATUS), never a red panel
        <p
          role="alert"
          className="rounded-lg border-l-2 border-glow-red bg-steel px-4 py-3 text-sm text-glow-red"
        >
          {t(serverErrorKey)}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>
        {t(mode === 'login' ? 'auth.signIn' : 'auth.signUp')}
      </Button>
      {/* Optional Google OAuth — rendered only when the deploy enables it */}
      {import.meta.env.VITE_GOOGLE_AUTH === '1' ? (
        <Button variant="ghost" onClick={handleGoogleSignIn}>
          {t('auth.google')}
        </Button>
      ) : null}
    </form>
  )
}
