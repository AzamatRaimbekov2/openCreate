// apps/web/src/modules/Auth/components/AuthForm.tsx
// Email/password login-or-register form (v3 terminal, stage 3: rendered inside
// the login route's centered STEEL card — fields stay border-defined steel,
// mono weight-400 heading, submit pill tinted by mode per the reference
// taxonomy: log-in = red, sign-up = green).
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

// A mapped server failure: the localized i18n key to render, plus whether it is
// the "email already registered" case — the only one that offers a shortcut to
// switch the form to login (design.md §8: never render raw server text).
type ServerError = {
  // i18n key for the alert copy
  key: string
  // true only for the sign-up email-conflict case → render the switch-to-login link
  offerSwitchToLogin: boolean
}

// The better-auth client returns { error } with a code/status we branch on.
type AuthClientError = {
  // UpperSnakeCase error code (may be absent on some failures). Explicit
  // `| undefined` so a possibly-undefined value can be passed under
  // exactOptionalPropertyTypes (better-auth's error.code is string | undefined).
  code?: string | undefined
  // HTTP status — our fallback when the code is missing/unrecognised
  status?: number | undefined
}

// Map a better-auth client error to safe localized copy. better-auth 1.6.x
// returns UpperSnakeCase codes; the sign-up conflict is
// USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL (HTTP 422) — NOT USER_ALREADY_EXISTS —
// so we match both spellings and fall back to the status when the code is absent.
function mapServerError(error: AuthClientError, mode: AuthMode): ServerError {
  const { code, status } = error
  // Sign-up with an already-registered email → actionable copy + login shortcut
  if (
    code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
    code === 'USER_ALREADY_EXISTS' ||
    (mode === 'register' && status === 422)
  ) {
    return { key: 'auth.errors.emailTaken', offerSwitchToLogin: true }
  }
  // Wrong credentials on login (INVALID_EMAIL_OR_PASSWORD → HTTP 401)
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) {
    return { key: 'auth.errors.invalidCredentials', offerSwitchToLogin: false }
  }
  // Password below the 8-char minimum — reuse the field-level requirement copy
  if (code === 'PASSWORD_TOO_SHORT') {
    return { key: 'auth.errors.password', offerSwitchToLogin: false }
  }
  // Unknown/other → generic action-failed fallback
  return { key: 'errors.actionFailed', offerSwitchToLogin: false }
}

export function AuthForm() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>('login')
  const isLogin = mode === 'login'
  return (
    // The route's steel card owns the surface — the form only structures it,
    // opened by a mono weight-400 30px heading over the standard white/10
    // hairline (v3 heading law)
    <section className="flex w-full flex-col gap-8">
      <h1 className="border-b border-white/10 pb-5 text-3xl font-normal text-white">
        {t(isLogin ? 'auth.signIn' : 'auth.signUp')}
      </h1>
      {/* key={mode}: a mode switch is a new form — old errors must not linger.
          onSwitchToLogin lets the email-conflict banner flip register → login
          through the SAME setMode path as the toggle below (one source of truth
          for the mode); the remount then clears the fields and the banner. */}
      <AuthFields key={mode} mode={mode} onSwitchToLogin={() => setMode('login')} />
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

// Private fields+submit component — remounted per mode by the parent.
// onSwitchToLogin: flip the whole form to login mode (used by the email-conflict
// banner so a user who already has an account is one click from signing in).
function AuthFields({ mode, onSwitchToLogin }: { mode: AuthMode; onSwitchToLogin: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // Server-side failure (null = no error). Carries the localized key AND whether
  // to offer the switch-to-login shortcut, so the banner needs no re-derivation.
  const [serverError, setServerError] = useState<ServerError | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(mode === 'login' ? loginSchema : registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = async (values: AuthFormValues) => {
    setServerError(null)
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
      // Map by code first, status as fallback (design.md §8: localized, safe copy)
      setServerError(mapServerError({ code: result.error.code, status: result.error.status }, mode))
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
      {serverError ? (
        // Inline non-blocking failure banner (design.md §8); alert = announced.
        // v3 treatment: a calm RECESSED block with a glow-red left rule — red
        // stays on the rule + text (the failure STATUS), never a red panel.
        // bg-abyss (not steel): the form now sits on the login card's steel
        // surface, so the banner steps DOWN the ladder to stay visible.
        <div
          role="alert"
          className="rounded-lg border-l-2 border-glow-red bg-abyss px-4 py-3 text-sm text-glow-red"
        >
          <p>{t(serverError.key)}</p>
          {/* Email-conflict only: a portal-blue prose link (design.md §2 link
              law) that flips register → login, so an existing user acts on the
              message instead of re-reading it. The affordance carries the login
              STATUS forward — it is not a red control. */}
          {serverError.offerSwitchToLogin ? (
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="mt-2 min-h-10 self-start text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {t('auth.signIn')}
            </button>
          ) : null}
        </div>
      ) : null}
      {/* Submit tint follows the reference taxonomy (design.md v3 §2): log-in
          is an auth-entry action → RED specimen pill; sign-up creates an
          account → GREEN specimen pill. Same closed triad, no new colors. */}
      <Button
        type="submit"
        variant={mode === 'login' ? 'danger' : 'primary'}
        isLoading={isSubmitting}
      >
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
