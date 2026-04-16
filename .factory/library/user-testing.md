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

### Dry Run Results

- Dev servers start successfully (API on 3001, frontend on 5173)
- agent-browser can navigate, render pages, fill forms, submit
- Resource usage is lightweight (~200 MB for dev stack)
- Registration form submits but requires working API proxy (Vite proxies /api → localhost:3001)
