# Server-Sent Events (SSE) — Realtime Updates

Reference for workers touching the realtime subsystem added in the
`sse-realtime-updates` feature.

## Endpoint

```
GET /api/orgs/:orgId/events
```

- Content-Type: `text/event-stream`
- Auth: `Authorization: Bearer <jwt>` OR `?access_token=<jwt>` (EventSource can't send headers).
- Authz: user must be owner/member of `orgId`.
- Keepalive: a `: keepalive <ts>` comment is sent every ~25s so proxies don't drop idle sockets.

## Event types (`SseEventType`)

| Type | Payload |
|---|---|
| `connected` | `{ orgId, ts }` — sent immediately on connect. |
| `ping` | reserved; comments are used for keepalive instead. |
| `employee.created` | `{ employee }` |
| `employee.updated` | `{ employee }` |
| `employee.deleted` | `{ employeeId, affectedReportIds }` |
| `employee.moved` | `{ employee, previousManagerId, previousOrder }` |
| `employee.bulk_created` | `{ employees[] }` |
| `scenario.created` | `{ scenario }` |
| `scenario.deleted` | `{ scenarioId }` |
| `scenario.updated` | `{ scenario }` |

## Emitting from controllers

Import the helpers and call them AFTER the mutation succeeds:

```ts
import { emitScenarioScopedEvent, emitOrgScopedEvent } from "../sse/emit";

await emitScenarioScopedEvent(scenarioId, "employee.created", { employee });
emitOrgScopedEvent(orgId, "scenario.created", { scenario });
```

`emitScenarioScopedEvent` resolves `scenarioId → orgId` for you.
Emission is best-effort: failures are swallowed so a broken SSE fanout can
never fail the REST mutation.

## Client-side usage

`useOrgEvents()` is invoked once from `AppShell.tsx` and keeps an
EventSource alive that follows `currentOrg`. Events are translated into
orgStore mutations inside `sseStore#applyServerEvent`.

- Status badge: `<ConnectionStatusIndicator />` renders from `useSseStore`.
- Connection states: `idle | connecting | connected | reconnecting | disconnected`.
- Reconnect: exponential backoff (500ms base, 30s cap). On transition
  back to `connected`, `fetchEmployees` is called to sync missed changes.

## Testing

- Backend integration tests: `packages/server/src/__tests__/sse.test.ts` —
  spins up an HTTP server on an ephemeral port and reads the event-stream
  chunks directly via `http.get`.
- Frontend tests: `packages/client/src/__tests__/sseStore.test.ts` exercises
  `useSseStore._handleEvent` against the real orgStore;
  `packages/client/src/__tests__/ConnectionStatusIndicator.test.tsx`
  verifies the status badge per state.

## Gotchas

- EventSource cannot attach Authorization headers. Always include
  `?access_token=...`.
- `app.ts` mounts `sseRoutes` BEFORE `orgRoutes` so the authenticated
  org router doesn't swallow `/orgs/:orgId/events`.
- Always call `eventBus.reset()` in afterAll of SSE tests to avoid
  lingering clients pointing at torn-down servers.
