# Relay Architecture

## Overview

Relay is a sales introduction request, prospecting, and relationship mapping platform. It consists of four packages in an npm workspaces monorepo at `/Users/andy/Documents/GitHub/relay`.

## Project Structure

```
relay/
├── packages/
│   ├── api/              # Express TypeScript REST API
│   ├── web/              # React + Vite frontend
│   ├── shared/           # Shared types, Zod schemas, constants
│   └── chrome-extension/ # Manifest V3 Chrome extension
├── docker-compose.yml    # MongoDB container
├── package.json          # Monorepo root with npm workspaces
├── tsconfig.base.json    # Base TypeScript config
└── .env.example          # Environment variable template
```

## Package Details

### packages/api (Express Backend)

```
api/src/
├── index.ts              # Server entry: connect MongoDB, start Express
├── app.ts                # Express app: middleware, routes, error handler
├── config/               # Environment config, database connection
├── middleware/            # Auth (JWT verify), validation (Zod), error handler
├── models/               # Mongoose models
├── routes/               # Express Router files per domain
├── controllers/          # Request handlers (thin - delegate to services)
├── services/             # Business logic layer
├── integrations/         # Adapter interfaces and mock implementations
├── ai/                   # LLM provider setup (Vercel AI SDK)
└── utils/                # Shared utilities
```

**Patterns:**
- Controller → Service → Model (controllers thin, services hold logic)
- Zod validation middleware on routes
- Async error wrapper on all route handlers
- Global error handler: `{ error: { code, message, details? } }`
- JWT auth middleware sets `req.user` with user ID and email
- All lists use pagination: `{ data, pagination: { page, limit, total } }`

**Auth flow:**
- POST /api/auth/register → hash password → save User → return JWT pair
- POST /api/auth/login → verify password → return JWT pair
- POST /api/auth/refresh → verify refresh token → return new JWT pair
- GET /api/auth/google → Passport Google OAuth → callback → JWT pair
- GET /api/auth/microsoft → Passport Microsoft OAuth → callback → JWT pair

### packages/web (React Frontend)

```
web/src/
├── main.tsx              # Entry: BrowserRouter
├── App.tsx               # Route definitions
├── api/                  # Axios client with auth interceptor
├── components/           # Reusable UI (layout/, common/, [feature]/)
├── pages/                # Route page components
├── stores/               # Zustand stores (one per domain)
├── hooks/                # Custom React hooks
├── utils/                # Client utilities
└── types/                # Frontend types
```

**Patterns:**
- Zustand stores for client state
- Axios instance: baseURL `/api`, auto Bearer token, 401 → redirect to login
- Path alias `@/` → `src/`
- Tailwind CSS v4 via `@tailwindcss/vite`
- React Flow for relationship graph
- AG Grid for data tables
- React Router v6 with protected route wrapper

### packages/shared

- Zod schemas used by both API and web
- TypeScript types inferred from Zod
- Constants (connection types, intro statuses, etc.)
- Utility functions

### packages/chrome-extension

```
chrome-extension/
├── manifest.json         # Manifest V3
├── src/
│   ├── background/       # Service worker
│   ├── content/          # Content scripts for LinkedIn
│   ├── sidepanel/        # Side panel React app
│   ├── popup/            # Popup React app
│   └── shared/           # Shared utilities
```

**Communication:** Content script ↔ Background ↔ API via chrome.runtime.sendMessage and fetch with JWT from chrome.storage.local.

## Data Model (MongoDB Collections)

- **users** - Auth accounts
- **contacts** - People (name, email, title, company ref, tags, source)
- **companies** - Organizations
- **relationships** - Edges between contacts (from, to, type, strength)
- **introRequests** - Intro workflow state machine
- **introTemplates** - Reusable templates
- **savedSearches** - Persisted filters with alerts
- **prospectLists** - Named contact lists
- **campaigns** - LinkedIn outreach campaigns
- **activityLogs** - All system activity
- **integrationConfigs** - Per-user integration settings (encrypted keys)
- **webhooks** - Webhook endpoints and subscriptions
- **scoringRules** - Lead scoring rules
- **icpProfiles** - Ideal Customer Profiles

## Key Invariants

1. All API endpoints require JWT auth except auth routes and /api/health
2. Intro requests follow state machine: draft → pending → approved/declined → forwarded → accepted/declined/expired
3. Relationship graph is bidirectional (A→B implies B→A visibility)
4. Integration adapters implement a common interface; mock ↔ real swapped via adapter
5. Contact deletion cascades to relationships, intro requests, prospect lists
6. All timestamps UTC ISO strings
7. Chrome extension communicates only through the API (never direct DB)
