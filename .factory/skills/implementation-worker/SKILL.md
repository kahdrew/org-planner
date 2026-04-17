---
name: implementation-worker
description: Fullstack worker for org-planner features spanning React frontend and Express backend
---

# Implementation Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

**CRITICAL: All code lives at `/Users/andy/Documents/GitHub/org-planner`. You MUST cd into this directory for all operations.**

## When to Use This Skill

All implementation features for the org-planner app: bug fixes, new API endpoints, new React components/views, state management changes, database model updates, and features that span frontend + backend.

## Required Skills

- **agent-browser**: MUST be invoked for any feature that changes UI behavior. Used to manually verify user-facing flows in the browser at http://localhost:5173. Invoke after implementation is complete to verify the feature works end-to-end.

## Work Procedure

### 1. Understand the Feature

- Read the feature's `description`, `expectedBehavior`, and `verificationSteps` carefully.
- Read `AGENTS.md` for mission boundaries and conventions.
- Read `.factory/library/architecture.md` to understand how the system works.
- Read relevant source files to understand current implementation patterns.
- Identify which layers need changes: models, controllers, routes, API client, stores, components, views.

### 2. Write Tests First (TDD)

- **Server tests**: For any API/backend change, write Vitest tests in `packages/server/src/__tests__/` BEFORE implementing. Use supertest for HTTP-level tests. Tests should initially FAIL (red).
- **Client tests**: For any component/view change, write Vitest + Testing Library tests in `packages/client/src/__tests__/` BEFORE implementing. Tests should initially FAIL (red).
- Run the specific test file to confirm tests fail: `npx vitest run <test-file> --reporter=verbose`
- Then implement to make tests pass (green).

### 3. Implement

- Follow existing code patterns. Match the style of surrounding code exactly.
- **Backend pattern**: Model (Mongoose schema in packages/server/src/models/) → Controller (business logic + Zod validation in packages/server/src/controllers/) → Route (Express router, auth middleware in packages/server/src/routes/) → Register in packages/server/src/app.ts.
- **Frontend pattern**: API client function (packages/client/src/api/) → Zustand store action (packages/client/src/stores/) → Component/View UI (packages/client/src/components/).
- **Validation**: Use Zod schemas on the server for all request bodies. Match existing Zod usage patterns.
- **Types**: Update `packages/client/src/types/index.ts` when adding new data structures.
- **Authorization**: Use requireOrgMembership, requireScenarioAccess, or requireOrgRole middleware for protected routes. Check packages/server/src/middleware/authorization.ts for available helpers.
- Keep changes minimal and focused on the feature scope.

### 4. Run Validators

After implementation:
```bash
cd /Users/andy/Documents/GitHub/org-planner
npm run test          # All tests pass
npm run typecheck     # No type errors
npm run lint          # No lint errors
```

Fix any failures before proceeding. Note: there are 4 pre-existing failures in scheduledChanges.test.ts 'Auto-apply middleware' — these are known and unrelated to new work.

### 5. Manual Verification with agent-browser

For ANY feature that changes user-visible behavior:

1. Start the dev servers if not already running (check ports 3001 and 5173 first).
2. Invoke the `agent-browser` skill.
3. Navigate to http://localhost:5173.
4. If auth is needed: register a new test user or log in with existing credentials.
5. Exercise the specific feature you implemented — every expected behavior from the feature spec.
6. Verify adjacent features still work (e.g., if you changed employee editing, verify the org chart still renders correctly).
7. Record each check as an `interactiveChecks` entry with the action taken and what you observed.

### 6. Clean Up

- Stop any dev servers or processes you started (check ports 3001 and 5173).
- Ensure no orphaned processes remain.
- Commit all changes with a descriptive message.

## Example Handoff

```json
{
  "salientSummary": "Implemented analytics dashboard with 5 widgets (headcount trends, cost breakdown, employment distribution, open positions, hiring velocity). Added /dashboard route, auth protection, scenario-aware data. Created 12 tests for dashboard components and API. Verified in browser: all widgets render with correct data matching HeadcountSummary.",
  "whatWasImplemented": "New /dashboard route with DashboardView component. Five chart widgets using recharts. API endpoint GET /api/scenarios/:id/analytics returning aggregated data. Dashboard nav link in sidebar. Auth-protected route in App.tsx.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "npm run test", "exitCode": 0, "observation": "All tests pass including 12 new dashboard tests"},
      {"command": "npm run typecheck", "exitCode": 0, "observation": "No type errors"},
      {"command": "npm run lint", "exitCode": 0, "observation": "No new lint errors"}
    ],
    "interactiveChecks": [
      {"action": "Navigated to /dashboard, verified all 5 widgets render", "observed": "Headcount trends chart shows line graph, cost breakdown shows bar chart by department, all data matches HeadcountSummary"}
    ]
  },
  "tests": {
    "added": [{"file": "packages/client/src/__tests__/Dashboard.test.tsx", "cases": [{"name": "renders all widgets", "verifies": "Dashboard component renders 5 chart widgets"}]}]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on an API endpoint, data model, or infrastructure that doesn't exist yet
- Requirements are ambiguous or contradictory
- Existing bugs in unrelated code block this feature
- Cannot start dev servers (port conflict, MongoDB connection failure, missing env vars)
- Feature scope is significantly larger than described
