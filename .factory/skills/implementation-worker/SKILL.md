---
name: implementation-worker
description: Fullstack worker for Relay platform features spanning React frontend, Express backend, and shared packages
---

# Implementation Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

**CRITICAL: All code lives at `/Users/andy/Documents/GitHub/relay`. You MUST cd into this directory for all operations.**

## When to Use This Skill

All implementation features for the Relay platform: project scaffolding, API endpoints, React pages/components, database models, business logic, AI integration, integration adapters, and features spanning frontend + backend.

## Required Skills

- **agent-browser**: MUST be invoked for any feature that changes UI behavior. Used to verify user-facing flows at http://localhost:3101. Invoke after implementation is complete.

## Work Procedure

### 1. Understand the Feature

- Read the feature's `description`, `expectedBehavior`, `preconditions`, and `verificationSteps` carefully.
- Read `AGENTS.md` for mission boundaries and conventions.
- Read `.factory/library/architecture.md` to understand Relay's structure.
- Read `.factory/library/environment.md` for env vars and project location.
- Check `.factory/research/` for relevant tech documentation (e.g., `express-mongo-patterns.md`, `auth-patterns.md`, `llm-integration.md`, `react-vite-tailwind.md`).
- Read relevant existing source files in `/Users/andy/Documents/GitHub/relay/` to understand current patterns.
- Identify which layers need changes: models, services, controllers, routes, API client, stores, components, pages.

### 2. Write Tests First (TDD)

- **API tests**: For backend changes, write Vitest tests in `packages/api/src/__tests__/` BEFORE implementing. Use supertest for HTTP-level tests. Tests should initially FAIL (red).
- **Frontend tests**: For component changes, write Vitest + @testing-library/react tests in `packages/web/src/__tests__/` BEFORE implementing. Tests should initially FAIL (red).
- **Shared tests**: For shared schema/utility changes, write tests in `packages/shared/src/__tests__/`.
- Run the specific test file to confirm tests fail: `cd /Users/andy/Documents/GitHub/relay && npx vitest run <test-file> --reporter=verbose`
- Then implement to make tests pass (green).

### 3. Implement

Follow existing patterns. Match surrounding code style exactly.

**Backend pattern (packages/api):**
1. Model: Mongoose schema in `src/models/` with TypeScript types
2. Service: Business logic in `src/services/` (all DB queries, processing here)
3. Controller: Thin handlers in `src/controllers/` that call services, handle HTTP concerns
4. Route: Express Router in `src/routes/` with Zod validation middleware + auth middleware
5. Register route in `src/app.ts`

**Frontend pattern (packages/web):**
1. API client function in `src/api/` using the shared axios instance
2. Zustand store action in `src/stores/` for state management
3. Page component in `src/pages/` for route-level views
4. Reusable components in `src/components/`

**Shared package (packages/shared):**
- Zod schemas shared between API and web go here
- Type definitions inferred from Zod schemas
- Constants (enums, status values, etc.)

**Key conventions:**
- Zod validation on all API request bodies via validation middleware
- Async error wrapper on all route handlers
- Global error handler returns `{ error: { code, message, details? } }`
- All list endpoints use pagination: `{ data, pagination: { page, limit, total } }`
- JWT auth middleware sets `req.user` with user ID and email
- Tailwind CSS v4 for styling (use `@tailwindcss/vite` plugin)
- Path alias `@/` → `src/` in web package

### 4. Run Validators

After implementation, run from `/Users/andy/Documents/GitHub/relay`:
```bash
cd /Users/andy/Documents/GitHub/relay && npm run test
cd /Users/andy/Documents/GitHub/relay && npm run typecheck
cd /Users/andy/Documents/GitHub/relay && npm run lint
```

Fix any failures before proceeding.

### 5. Manual Verification with agent-browser

For ANY feature that changes user-visible behavior:

1. Ensure services are running: MongoDB on 27017, API on 3100, Web on 3101.
2. Start services if needed using `.factory/services.yaml` commands.
3. Invoke the `agent-browser` skill.
4. Navigate to http://localhost:3101.
5. If auth needed: register a test user or log in.
6. Exercise EVERY expected behavior from the feature spec.
7. Verify adjacent features still work (e.g., if you changed contacts, verify relationships still render).
8. Record each check as an `interactiveChecks` entry.

### 6. Clean Up

- Stop any dev servers or processes you started (check ports 3100 and 3101).
- Ensure no orphaned processes remain.
- Commit all changes with a descriptive message from `/Users/andy/Documents/GitHub/relay`.

## Example Handoff

```json
{
  "salientSummary": "Implemented Contact CRUD API with 5 endpoints (GET list, GET detail, POST create, PUT update, DELETE) and React contact list page with pagination, search, and create modal. Added 8 Vitest tests covering all endpoints including validation errors. Verified in browser: created 3 contacts, searched by name, edited one, deleted one, pagination works with 25+ contacts.",
  "whatWasImplemented": "Mongoose Contact model with name/email/title/company/tags fields. ContactService with CRUD + search + pagination. ContactController + routes with Zod validation. React ContactListPage with AG Grid table, search bar, create/edit modal. Zustand contactStore. API client functions in web/src/api/contacts.ts.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "cd /Users/andy/Documents/GitHub/relay && npx vitest run packages/api/src/__tests__/contacts.test.ts --reporter=verbose",
        "exitCode": 0,
        "observation": "8 tests passed: list, detail, create, create-validation, update, update-404, delete, delete-404"
      },
      {
        "command": "cd /Users/andy/Documents/GitHub/relay && npm run typecheck",
        "exitCode": 0,
        "observation": "No type errors across all packages"
      },
      {
        "command": "cd /Users/andy/Documents/GitHub/relay && npm run lint",
        "exitCode": 0,
        "observation": "No lint errors"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Navigated to http://localhost:3101/contacts, clicked 'Add Contact', filled in name='Jane Smith' email='jane@acme.com' title='VP Sales', submitted",
        "observed": "Contact created, appeared in table with correct fields. Toast notification shown."
      },
      {
        "action": "Typed 'Jane' in search bar",
        "observed": "Table filtered to show only Jane Smith. Search is debounced, results appear after ~300ms."
      },
      {
        "action": "Clicked Jane Smith row, clicked Edit, changed title to 'SVP Sales', saved",
        "observed": "Title updated in detail panel and table row. Toast shown."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "packages/api/src/__tests__/contacts.test.ts",
        "cases": [
          {"name": "GET /api/contacts returns paginated list", "verifies": "List endpoint with pagination"},
          {"name": "POST /api/contacts creates contact", "verifies": "Create with valid data"},
          {"name": "POST /api/contacts validates required fields", "verifies": "Zod validation rejects missing name"},
          {"name": "PUT /api/contacts/:id updates contact", "verifies": "Update existing contact"},
          {"name": "DELETE /api/contacts/:id removes contact", "verifies": "Soft or hard delete"}
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on API endpoints, models, or infrastructure not yet created
- Requirements are ambiguous or contradictory
- Existing bugs in unrelated code block this feature
- Cannot start services (Docker not running, MongoDB connection failure, port conflicts)
- Feature scope is significantly larger than described
- Missing npm packages that aren't in package.json and unclear if they should be added
