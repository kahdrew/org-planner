# User Testing

Testing surface, required tools, isolation guidance, and resource limits for validation runs.

---

## Validation Surface

### Web Application (Primary)
- **URL**: http://localhost:5173
- **Tool**: agent-browser
- **Setup**: Start API on port `3001` and web app on port `5173` (MongoDB Atlas via `packages/server/.env`)
- **Auth bootstrap**: Register a fresh user via `/register`, create org/scenario as needed for each flow

### API Endpoints (Secondary)
- **Base URL**: http://localhost:3001/api
- **Tool**: curl
- **Setup**: API server running on port `3001`
- **Auth**: `POST /api/auth/register` or `/api/auth/login`, then use `Authorization: Bearer <jwt>`

## Validation Concurrency

### agent-browser
- **Max concurrent**: 2
- **Rationale**: Browser validation flows here are interactive and mutate shared org/scenario state. Two parallel validators are safe with isolated users/orgs while keeping run stability high.

### curl
- **Max concurrent**: 5
- **Rationale**: Low-resource API requests; can safely run in parallel when using isolated test data.

## Flow Validator Guidance: agent-browser

- Use a unique test identity per validator (email suffix by group id/session id).
- Create a separate org and scenario per validator; do not reuse existing seeded/demo orgs.
- Do not rely on data created by other validators.
- Keep all evidence under the assigned evidence directory only.
- If a step depends on drag-and-drop, record both UI result and persisted result after refresh when assertion requires persistence.
- If `@ref` drag targeting is unreliable, use coordinate-based mouse drag with DOM-derived element bounds.
- If prompt-driven org/scenario bootstrap is flaky in automation, use authenticated in-session API bootstrap, then perform assertion checks via UI.
- After navigation, modal submits, or auth transitions, refresh element references with a new `snapshot -i` before the next click/type action to avoid stale-ref failures.
- In Approvals queues, action buttons can be icon-only; verify the action by tooltip/icon/color mapping before bulk or destructive actions.
- Enabling approval chains can disable direct **Add Employee** UI paths; for assertions that still require setup data, bootstrap test employees through isolated request flows or authenticated in-session API setup, then validate outcomes in UI.
- In analytics timeline flows, adjacent timeline markers may intercept clicks; use slider keyboard/scrub controls (or precise script-assisted slider values) to hit exact event points reliably.
- After creating timeline/scheduled-change events in-session, refresh once before final timeline assertions if markers or history do not appear immediately.
- In CompareView assertions, wait for the "Loading comparison…" state to clear before capturing counts/evidence; async diff fetch may lag briefly after selector changes.

## Flow Validator Guidance: curl

- Use unique emails/org names/scenario names per validator run.
- Validate both status code and response body fields required by the assertion.
- Avoid destructive operations outside resources created by that validator.

## Test Data Strategy

- Every validator creates and uses isolated data.
- Email pattern: `testuser-<group>-<timestamp>@orgplanner.test`.
- Org/scenario names include the validator group id for traceability.
