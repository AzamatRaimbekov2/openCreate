// apps/web/src/@types/global.d.ts
// Global ambient declarations ONLY (per modular architecture rules).
// Module/shared types live next to their code — never here.

// No ambient client env vars are declared right now. Google sign-in used to be
// gated on a build-time `VITE_GOOGLE_AUTH` flag here; it is now driven at RUNTIME
// by GET /api/auth/config (see modules/Auth/model/authConfig.ts, ADR google-oauth),
// so the flag was removed. When a new VITE_* var is genuinely needed, re-add an
// `interface ImportMetaEnv { readonly VITE_FOO?: string }` block here — it merges
// into vite/client's declaration.
export {}
