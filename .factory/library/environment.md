# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Project Location

All Relay code lives at `/Users/andy/Documents/GitHub/relay`. Workers MUST work in this directory.

## Required Environment Variables

| Variable | Purpose | Default/Notes |
|---|---|---|
| MONGODB_URI | MongoDB connection | mongodb://localhost:27017/relay |
| JWT_SECRET | Access token signing | Generate with `openssl rand -hex 32` |
| JWT_REFRESH_SECRET | Refresh token signing | Generate with `openssl rand -hex 32` |
| GOOGLE_CLIENT_ID | Google OAuth | Placeholder until user provides |
| GOOGLE_CLIENT_SECRET | Google OAuth | Placeholder until user provides |
| MICROSOFT_CLIENT_ID | Microsoft OAuth | Placeholder until user provides |
| MICROSOFT_CLIENT_SECRET | Microsoft OAuth | Placeholder until user provides |
| OPENAI_API_KEY | OpenAI for intro drafting | Mock when absent |
| ANTHROPIC_API_KEY | Anthropic for intro drafting | Mock when absent |
| PORT | API server port | 3100 |
| NODE_ENV | Environment | development |

## External Dependencies

- **Docker**: Required for MongoDB container. Docker Desktop must be running.
- **MongoDB 7**: Docker container `relay-mongodb` on port 27017. No auth in dev.
- **Node.js 20**: Available at v20.20.2.

## Integration Credentials

All integrations (Salesforce, LinkedIn, Apollo, Gong, Granola) use mock adapters. No real API keys needed. Mock adapters return realistic fake data.

## Dependency Notes

- **Zod v4**: The project uses Zod v4 (4.3.6), NOT v3. Key differences: `required_error` removed (use `error` callback instead), `error.errors` renamed to `error.issues`. Research snippets in `.factory/research/` may reference v3 API - always check against v4 when implementing.

## Platform

- macOS darwin 25.4.0, 24GB RAM, 10 CPU cores
- npm v10.8.2, Node.js v20.20.2, Docker v28.5.1
