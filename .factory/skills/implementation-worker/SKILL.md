---
name: implementation-worker
description: Fullstack worker for org-planner features spanning React frontend and Express backend
---

# Implementation Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

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
- **Backend pattern**: Model (Mongoose schema) → Controller (business logic + Zod validation) → Route (Express router, auth middleware) → Register in api/index.ts or server entry.
- **Frontend pattern**: API client function (packages/client/src/api/) → Zustand store action → Component/View UI.
- **Validation**: Use Zod schemas on the server for all request bodies. Match existing Zod usage patterns.
- **Types**: Update `packages/client/src/types/index.ts` when adding new data structures.
- Keep changes minimal and focused on the feature scope.

### 4. Run Validators

After implementation:
```bash
npm run test          # All tests pass
npm run typecheck     # No type errors (npx tsc --noEmit if script not yet added)
npm run lint          # No lint errors (if configured)
```

Fix any failures before proceeding.

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
  "salientSummary": "Fixed scenario diff API URL mismatch — client now calls GET /api/scenarios/:a/diff/:b matching the server route. Added 3 Vitest tests for the diff endpoint covering success, missing scenario, and same-scenario cases. Verified in browser: selected two scenarios in CompareView, diff loaded correctly showing added/removed/changed employees.",
  "whatWasImplemented": "Updated packages/client/src/api/scenarios.ts diffScenarios function to use path params (/scenarios/${a}/diff/${b}) instead of query params. Added test file packages/server/src/__tests__/scenarios.test.ts with 3 test cases for the diff endpoint.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npx vitest run packages/server/src/__tests__/scenarios.test.ts --reporter=verbose",
        "exitCode": 0,
        "observation": "3 tests passed: diff returns correct delta, 404 for missing scenario, 400 for same scenario"
      },
      {
        "command": "npx tsc --noEmit",
        "exitCode": 0,
        "observation": "No type errors"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Navigated to http://localhost:5173, logged in, created org 'TestOrg', created scenario 'Base' with 3 employees, cloned to 'Variant', deleted one employee from Variant",
        "observed": "All operations succeeded, employees displayed correctly in org chart"
      },
      {
        "action": "Navigated to /compare, selected Base and Variant scenarios, clicked Compare",
        "observed": "Diff loaded correctly: 1 employee shown as 'removed' in red, 2 shown as 'unchanged' in gray. Previously this would have failed with a network error due to URL mismatch."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "packages/server/src/__tests__/scenarios.test.ts",
        "cases": [
          {"name": "diff returns correct delta between scenarios", "verifies": "Diff endpoint returns added/removed/changed/unchanged arrays"},
          {"name": "diff returns 404 for missing scenario", "verifies": "Error handling for invalid scenario ID"},
          {"name": "diff returns 400 for same scenario", "verifies": "Cannot diff a scenario with itself"}
        ]
      }
    ]
  },
  "discoveredIssues": [
    {
      "severity": "low",
      "description": "Scenario diff compares employees by name field, not by a stable ID. If two employees have the same name, diff results may be inaccurate.",
      "suggestedFix": "Consider adding a stableId field to employees that persists across scenario clones"
    }
  ]
}
```

## When to Return to Orchestrator

- Feature depends on an API endpoint, data model, or infrastructure that doesn't exist yet and isn't part of this feature's scope
- Requirements are ambiguous or contradictory (e.g., feature spec says one thing but existing code does another)
- Existing bugs in unrelated code block this feature
- Test infrastructure is broken or missing (e.g., Vitest not configured yet but feature requires tests)
- Cannot start dev servers (port conflict, MongoDB connection failure, missing env vars)
- Feature scope is significantly larger than described (e.g., expected 1 endpoint but needs 5)
