// apps/web/src/modules/Creator/index.ts
// Public API of the Creator module (openCreator — the /creator agent chat).
// Deliberately ONE export: the route composes the whole screen from the
// workbench, and everything else (the rail, the transcript, the cards, the
// composer, the api layer) is an internal of this module. Re-exporting them
// would publish an API with no consumer and invite a second screen to assemble
// the chat differently.
export { CreatorWorkbench } from './components/CreatorWorkbench'
