# User Testing

Testing surface, tools, and resource cost classification.

---

## Validation Surface

| Surface | URL | Tool | Notes |
|---------|-----|------|-------|
| Browser (React SPA) | http://localhost:5173 | agent-browser | Primary validation surface |
| API endpoints | http://localhost:3001/api/* | curl | Secondary, for auth/authorization checks |

### Auth Bootstrap

1. Register a test user: POST /api/auth/register with {email, password, name}
2. Login: POST /api/auth/login with {email, password} → JWT token
3. Browser: Navigate to http://localhost:5173, fill register form, submit
4. Subsequent flows use the authenticated session

### API Data Bootstrap (Post-Auth)

Useful endpoints for quickly creating minimal test data after obtaining a JWT:

1. Create org: `POST /api/orgs` with `{ "name": "Test Org" }`
2. Create scenario: `POST /api/orgs/:orgId/scenarios` with `{ "name": "Baseline" }`
3. Create employee: `POST /api/scenarios/:scenarioId/employees` with:
   `{ "name":"Test Employee","title":"Engineer","department":"Engineering","level":"IC3","location":"Remote","employmentType":"FTE","status":"Active" }`

### Setup Requirements

- Start both services: `npm run dev` (runs API on 3001 + Vite on 5173 concurrently)
- Ensure MongoDB Atlas is reachable (internet connection required)
- For AI testing (Milestone 6): ANTHROPIC_API_KEY must be set in .env

## Validation Concurrency

**Machine specs:** 24 GB RAM, 10 CPU cores, ~6 GB baseline usage
**Usable headroom:** 18 GB * 0.7 = ~12.6 GB

**agent-browser surface:**
- Dev stack (API + Vite): ~200 MB total
- Each agent-browser instance: ~300 MB
- 4 concurrent instances: ~1.2 GB + 200 MB = ~1.4 GB (well within budget)
- **Max concurrent: 4**

**curl surface:**
- API calls are lightweight and headless; bottleneck is shared database writes
- Keep concurrent curl validators moderate to reduce cross-test race risk
- **Max concurrent: 3**

### Dry Run Results

- Dev servers start successfully (API on 3001, frontend on 5173)
- agent-browser can navigate, render pages, fill forms, submit
- Resource usage is lightweight (~200 MB for dev stack)
- Registration form submits but requires working API proxy (Vite proxies /api → localhost:3001)

## Flow Validator Guidance: curl

- Stay within assigned assertion IDs only.
- Use unique test namespaces per validator (email/org/scenario prefixes) to avoid data collisions.
- Never reuse another validator's token, orgId, scenarioId, or employee IDs.
- Treat 403/404 equivalence exactly as contract specifies; do not over-interpret.
- Save request/response evidence under the assigned evidence directory.

## Flow Validator Guidance: agent-browser

- Use isolated credentials and org/scenario names assigned in the prompt.
- Avoid mutating resources outside your assigned namespace.
- Capture screenshot evidence for each assertion outcome (pass/fail/blocked).
- If a flow depends on API seed data, seed only within your namespace before UI validation.
- Keep browser interactions deterministic: explicit waits for route changes/network completion before assertions.

## Automation Notes from Foundations Validation

- `agent-browser` `network requests` capture can intermittently show no entries; when this happens, collect endpoint/status evidence with temporary in-page XHR logging.
- Org/scenario creation uses native prompt dialogs; queue `dialog accept` before clicking creation actions for deterministic runs.
- CSV import uses a native OS file picker; in headless runs, target the generated `<input type="file">` and dispatch a `change` event with a synthetic `File`.
