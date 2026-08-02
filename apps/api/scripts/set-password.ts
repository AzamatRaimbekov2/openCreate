// Dev-only credential repair: set a user's password from the command line.
//
// WHY THIS EXISTS: the app ships NO forgot/reset-password flow on purpose —
// there is no mail infrastructure to send a reset link through (see
// modules/auth/auth.ts: every password user stays emailVerified=false forever).
// That makes a forgotten local password otherwise unrecoverable without hand-
// editing the sqlite file, which is exactly the mistake this script prevents.
//
// WHY better-auth's OWN hasher, not node:crypto scrypt directly: the sign-in
// endpoint verifies the stored string with auth.$context.password.verify, whose
// salt/params encoding is better-auth's private format. Hashing with anything
// else writes a credential that can never sign in. Same reasoning — and the
// same call — as the dev-admin seed (modules/auth/dev-admin.ts).
//
// NOTE ON LENGTH: no minimum is enforced here. better-auth applies its 8-char
// minimum on the SIGN-UP path only; sign-in just verifies the hash. So this can
// legitimately set the short muscle-memory passwords dev accounts use, without
// weakening the signup rule for real users.
//
// Usage (from the repo root):
//   pnpm --filter @opencreate/api exec tsx scripts/set-password.ts <email> <password>
import { and, eq } from 'drizzle-orm'
import { loadConfig, loadEnvFromFile } from '../src/config'
import { createDb } from '../src/db/client'
import { account, user } from '../src/db/schema'
import { createAuth } from '../src/modules/auth/auth'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('usage: tsx scripts/set-password.ts <email> <password>')
  process.exit(1)
}

loadEnvFromFile()
const config = loadConfig()
const { db } = createDb(config.databasePath)
const auth = createAuth(db, config)

const row = db.select().from(user).where(eq(user.email, email)).get()
if (!row) {
  console.error(`no user with email ${email}`)
  process.exit(1)
}

const ctx = await auth.$context
const passwordHash = await ctx.password.hash(password)
const now = new Date()

// A user may exist with NO credential row (e.g. Google-only sign-up), so this
// upserts: update the existing credential account, or create one so the account
// gains a password login. accountId = user id mirrors what better-auth's own
// adapter writes for the 'credential' provider.
const credential = db
  .select()
  .from(account)
  .where(and(eq(account.userId, row.id), eq(account.providerId, 'credential')))
  .get()

if (credential) {
  db.update(account)
    .set({ password: passwordHash, updatedAt: now })
    .where(eq(account.id, credential.id))
    .run()
} else {
  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      userId: row.id,
      accountId: row.id,
      providerId: 'credential',
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

console.log(`password ${credential ? 'updated' : 'created'} for ${email}`)
