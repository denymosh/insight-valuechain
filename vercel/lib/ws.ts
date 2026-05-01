// Compatibility shim — the Vercel build doesn't use WebSocket. This file
// only re-exports the Quote type so existing component imports keep working.
export type { Quote } from "./quote";
