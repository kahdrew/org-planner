# Org Planner

A full-stack org chart and headcount planning application. Build, visualize, and manage organizational hierarchies with multiple interactive views, scenario planning, and budget tracking.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite |
| **State Management** | Zustand |
| **Styling** | Tailwind CSS v4 |
| **Org Chart** | @xyflow/react (React Flow) |
| **Data Grid** | AG Grid Community |
| **Drag & Drop** | @dnd-kit |
| **Backend** | Express 4, Node.js |
| **Database** | MongoDB (Mongoose 8) |
| **Auth** | Session cookies (express-session + bcryptjs) |
| **Validation** | Zod |
| **Deployment** | Vercel |

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **MongoDB Atlas** account (or any MongoDB instance)

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd org-planner
```

### 2. Install dependencies

```bash
npm install
```

This installs dependencies for the root workspace and both packages (`packages/server` and `packages/client`).

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env`:

```env
MONGODB_URI=<your-mongodb-connection-string>
SESSION_SECRET=<your-random-secret>
PORT=3001
```

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (use MongoDB Atlas or a local instance) |
| `SESSION_SECRET` | Secret key for signing session cookies — use a long random string |
| `PORT` | API server port (defaults to `3001`) |

> **⚠️ Never commit `.env` files.** The `.gitignore` already excludes them.

## Development

Start both the API server and frontend dev server concurrently:

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:server   # Express API on http://localhost:3001
npm run dev:client   # Vite dev server on http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to the API server automatically.

## Testing

Run all tests (server + client):

```bash
npm run test
```

Run tests for a specific workspace:

```bash
npm run test:server   # Server API tests (Vitest + supertest)
npm run test:client   # Client component tests (Vitest + Testing Library)
```

## Linting & Type Checking

```bash
npm run lint          # Check for lint errors (ESLint)
npm run lint:fix      # Auto-fix lint errors
npm run typecheck     # TypeScript type checking (no emit)
```

## Building

Build both server and client for production:

```bash
npm run build
```

## Deployment

The app is configured for deployment on **Vercel**:

- The Express API is deployed as a serverless function via `api/index.ts`
- The React client is built as a static SPA to `packages/client/dist`
- URL rewrites route `/api/*` to the serverless function and all other paths to `index.html`

Set the following environment variables in your Vercel project settings:

- `MONGODB_URI` — your MongoDB Atlas connection string
- `SESSION_SECRET` — your session signing secret

## Project Structure

```
org-planner/
├── api/                        # Vercel serverless function entry point
├── packages/
│   ├── client/                 # React frontend
│   │   └── src/
│   │       ├── api/            # Axios API client functions
│   │       ├── components/
│   │       │   ├── auth/       # Login & Register pages
│   │       │   ├── layout/     # AppShell, Sidebar, Toolbar
│   │       │   ├── nodes/      # React Flow node components
│   │       │   ├── panels/     # Detail & Budget panels
│   │       │   └── views/      # OrgChart, Hierarchy, Spreadsheet, Kanban, Compare
│   │       ├── stores/         # Zustand state stores
│   │       ├── types/          # TypeScript interfaces
│   │       └── utils/          # Shared utilities
│   └── server/                 # Express backend
│       └── src/
│           ├── controllers/    # Route handlers with Zod validation
│           ├── middleware/     # Auth & authorization middleware
│           ├── models/         # Mongoose schemas (User, Organization, Scenario, Employee)
│           └── routes/         # Express route definitions
├── .factory/                   # Mission infrastructure (do not modify)
├── eslint.config.js            # ESLint flat config
├── tsconfig.base.json          # Shared TypeScript config
├── vercel.json                 # Vercel deployment config
└── package.json                # Root workspace config
```

### Views

| Route | View | Description |
|-------|------|-------------|
| `/` | Org Chart | Interactive canvas with drag-to-reparent (React Flow) |
| `/hierarchy` | Hierarchy | Collapsible tree with drag-and-drop reordering |
| `/spreadsheet` | Spreadsheet | Editable data grid (AG Grid) |
| `/kanban` | Kanban | Cards grouped by department or status |
| `/compare` | Compare | Side-by-side scenario diff |

## Contributing

1. Create a feature branch from `main`
2. Follow existing code patterns and conventions:
   - **Backend**: Model → Controller (Zod validation) → Route (auth middleware)
   - **Frontend**: API client → Zustand store → Component
   - Use TypeScript strict mode throughout
3. Write tests before implementing (TDD: red → green)
4. Ensure all checks pass before submitting:
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```
5. Open a pull request targeting `main`
