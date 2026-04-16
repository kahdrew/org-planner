# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `MONGODB_URI` | `packages/server/.env` | MongoDB Atlas connection string |
| `JWT_SECRET` | `packages/server/.env` | Secret for signing JWT tokens |
| `PORT` | `packages/server/.env` | API server port (default: 3001) |
| `ANTHROPIC_API_KEY` | `packages/server/.env` | Anthropic Claude API key (needed for Milestone 6) |

## External Dependencies

- **MongoDB Atlas**: Cloud-hosted MongoDB. Connection string in .env. No local MongoDB needed.
- **Anthropic Claude API**: Used for AI-powered planning in Milestone 6. Requires API key.

## Platform Notes

- macOS (darwin 25.4.0), Node.js via system install
- Docker available but not used for this mission (MongoDB is cloud-hosted)
- npm workspaces for monorepo management
