# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks.  
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Project Location

All org-planner code lives at `/Users/andy/Documents/GitHub/org-planner`.

## Required Environment Variables

Server env file location: `packages/server/.env`.

| Variable | Purpose | Default/Notes |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | Uses MongoDB Atlas in this mission (no local Mongo required). Also holds the express-session store. |
| `SESSION_SECRET` | express-session signing secret | Primary auth secret (falls back to `JWT_SECRET` during migration). |
| `JWT_SECRET` | Legacy JWT signing secret | Deprecated. Only read as a fallback when `SESSION_SECRET` is unset. Safe to remove once all environments set `SESSION_SECRET`. |
| `PORT` | API server port | Defaults to `3001` in local development. |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required only for AI milestone features. |

## External Dependencies

- **MongoDB Atlas**: Primary database backend for development/validation.
- **Anthropic API**: Needed only when validating AI-powered planning features.
- **Node.js / npm**: Node `v20.20.2`, npm `10.8.2`.

## Dependency Notes

- **Zod v4** is used in server validation; use v4 API semantics (`error.issues`, no v3-only patterns).
- `api/tsconfig.json` is intended for Vercel bundling/runtime and can raise
  **TS6059** (`rootDir` / file inclusion conflict) if run directly via
  `npx tsc --noEmit -p api/tsconfig.json`. Use root `npm run typecheck`
  (server + client projects) for mission validation instead.

## Platform

- macOS darwin `25.4.0`
