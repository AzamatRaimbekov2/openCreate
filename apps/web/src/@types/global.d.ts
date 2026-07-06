// apps/web/src/@types/global.d.ts
// Global ambient declarations ONLY (per modular architecture rules).
// Module/shared types live next to their code — never here.

// Typed client env vars — extend this when adding a new VITE_* flag.
// interface is required: ImportMetaEnv is merged into vite/client's declaration.
interface ImportMetaEnv {
  // '1' shows the Google sign-in button on the auth form (Task 14); unset in dev by default
  readonly VITE_GOOGLE_AUTH?: string
}
