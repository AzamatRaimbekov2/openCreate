// Dev-only super-admin seed (owner request, 2026-07-16): admin@dev.local /
// "admin", role 'super_admin', existing ONLY in development.
//
// WHY A DIRECT INSERT, NOT auth.api.signUpEmail: better-auth enforces its
// 8-char minimum on the SIGN-UP path, and the whole point of this account is
// the 5-char muscle-memory password. Sign-IN performs no length check (it only
// verifies the hash — checked against better-auth 1.6.23 source), so hashing
// the password with better-auth's OWN hasher (auth.$context.password.hash,
// scrypt) and writing the user+account rows directly gives a credential that
// signs in through the normal endpoint while never weakening the signup rules
// for real users.
//
// WHY SEEDED AT BOOT, NOT A SCRIPT: the dev database gets wiped casually
// (rm data/*.db, fresh checkouts, :memory: experiments). A boot-time idempotent
// seed means the account simply always exists in dev — nobody has to remember
// a setup step. The nodeEnv gate lives in app.ts next to the call, so this
// module stays testable in any env.
//
// THE DIRECT INSERT BYPASSES databaseHooks.user.create.after (hooks only fire
// through better-auth's own adapter ops), so the signup bonus is granted
// explicitly — the admin exists to test money paths, and a 0-credit admin
// cannot submit a single generation.
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { account, user } from '../../db/schema'
import { grantSignupBonus, type MoneyLog } from '../credits/ledger'
import type { Auth } from './auth'

export const DEV_ADMIN_EMAIL = 'admin@dev.local'
// Not a secret by design: a fixed, well-known dev credential. It must never
// reach production — the caller (app.ts) gates on nodeEnv === 'development'.
const DEV_ADMIN_PASSWORD = 'admin'

// "Infinite" credits for the dev admin (owner request, 2026-07-21), delivered as
// a huge FLOOR rather than a charge-path exemption. Why a floor and not a no-op
// in chargeCredits: a role-based charge exemption would live in the money-path
// invariant code (applyCharge) and silently free every super_admin — a footgun if
// that role ever exists in production. A boot-time top-up touches NOTHING in the
// charge/refund path, cannot affect real users, and is self-refilling: each boot
// tops the admin back up to the floor, so a dev session that spent credits gets
// them back on restart. 1e9 credits ÷ the priciest op (~135) ≈ 7.4M generations
// before it could even dent — effectively infinite for any dev use.
export const DEV_ADMIN_CREDITS = 1_000_000_000

// Top the admin up to the floor: grant only the DIFFERENCE, so an untouched admin
// sits exactly at DEV_ADMIN_CREDITS instead of climbing by a floor every boot. A
// spent-down balance is replenished; an at-or-above-floor balance is left alone.
// Grants go through grantSignupBonus so the balance stays consistent with the
// ledger history (a credit_transaction row backs every mutation).
function ensureUnlimitedBalance(db: Db, userId: string, log?: MoneyLog) {
  const row = db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, userId)).get()
  const current = row?.b ?? 0
  const delta = DEV_ADMIN_CREDITS - current
  if (delta > 0) grantSignupBonus(db, userId, delta, log)
}

// The credentials of an account to seed. The dev admin passes the fixed pair
// above; a deployment passes what its operator put in the environment. Nothing
// else may construct one — a caller that invents a password here has published it.
export type SuperAdminCredentials = { email: string; password: string; name: string }

// `_signupBonusCredits` is the REAL-USER signup bonus (config); an admin
// intentionally ignores it and is topped up to DEV_ADMIN_CREDITS instead. Kept in
// the signature so the app.ts call site (positional) is untouched.
export async function seedDevAdmin(
  db: Db,
  auth: Auth,
  _signupBonusCredits: number,
  log?: MoneyLog,
) {
  await seedSuperAdmin(
    db,
    auth,
    { email: DEV_ADMIN_EMAIL, password: DEV_ADMIN_PASSWORD, name: 'Dev Admin' },
    log,
  )
}

// Idempotent: creates the account, or repairs and refills the one already there.
// Runs on EVERY boot in every environment that configures it, which is what makes
// "the admin always exists" true rather than aspirational — a wiped volume, a
// hand-edited row and a spent-down balance all heal on the next start.
export async function seedSuperAdmin(
  db: Db,
  auth: Auth,
  creds: SuperAdminCredentials,
  log?: MoneyLog,
) {
  const existing = db.select().from(user).where(eq(user.email, creds.email)).get()
  if (existing) {
    // Repair, don't duplicate: a db that predates the role column (or a row
    // someone edited by hand) is healed to super_admin on the next boot.
    if (existing.role !== 'super_admin') {
      db.update(user)
        .set({ role: 'super_admin', updatedAt: new Date() })
        .where(eq(user.id, existing.id))
        .run()
    }
    // Refill an existing admin to the floor every boot (self-replenishing
    // "infinite" — the spent-down balance from a prior dev session comes back).
    ensureUnlimitedBalance(db, existing.id, log)
    return
  }

  // better-auth's own scrypt hasher — the sign-in endpoint must be able to
  // verify this hash, so no other hasher is correct here.
  const ctx = await auth.$context
  const passwordHash = await ctx.password.hash(creds.password)

  const now = new Date()
  const userId = crypto.randomUUID()
  db.insert(user)
    .values({
      id: userId,
      name: creds.name,
      email: creds.email,
      // Verified: there is no mailbox behind dev.local to click a link from.
      emailVerified: true,
      role: 'super_admin',
      createdAt: now,
      updatedAt: now,
    })
    .run()
  // The credential account row, exactly as better-auth's adapter would write
  // it: providerId 'credential', accountId = the user id, password = the hash.
  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  // A fresh admin starts at 0 → this grants the full floor. Same helper as the
  // existing-admin path so both routes land at exactly DEV_ADMIN_CREDITS.
  ensureUnlimitedBalance(db, userId, log)
}
