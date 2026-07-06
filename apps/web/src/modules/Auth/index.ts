// apps/web/src/modules/Auth/index.ts
// Public API of the Auth module — routes and the app shell import ONLY from
// 'modules/Auth'. Internal files (model/, components/) are private.
export { AuthForm } from './components/AuthForm'
export { signOut } from './model/authClient'
// beforeLoad guard for protected routes (/create, /library) — Task 16
export { requireSession } from './model/routeGuard'
export { useAuthSession, useMe } from './model/useSession'
