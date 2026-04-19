# Server-Sent Events (SSE) — Realtime Updates

Reference for workers touching the realtime subsystem added in the
`sse-realtime-updates` feature.

## Endpoint

```
GET /api/orgs/:orgId/events
GET /api/orgs/:orgId/events/poll?since_seq=<N>
```

- Content-Type: `text/event-stream`
- Auth: session cookie (`orgplanner.sid`). EventSource sends cookies automatically on same-origin requests. Legacy `Authorization: Bearer <jwt>` and `?access_token=<jwt>` have been removed.
- Authz: user must be owner/member of `orgId`.
- Keepalive: a `: keepalive <ts>` comment is sent every ~25s so proxies don't drop idle sockets.
- Polling fallback response: JSON payload with monotonically increasing `seq` values:
  `{ "events": [{ "seq": number, "ts": string, "type": string, "orgId": string, "payload": object }] }`

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
- Connection states: `idle | connecting | connected | reconnecting | polling | disconnected`.
- Reconnect: exponential backoff (500ms base, 30s cap). On transition
  back to `connected`, `fetchEmployees` is called to sync missed changes.
- Polling fallback: after 3 consecutive EventSource connection failures,
  client switches to polling `/events/poll` every 5s with `since_seq`
  from `lastSeq`, and applies returned events through the same
  `_handleEvent`/`applyServerEvent` pipeline.

## Testing

- Backend integration tests: `packages/server/src/__tests__/sse.test.ts` —
  spins up an HTTP server on an ephemeral port and reads the event-stream
  chunks directly via `http.get`.
- Frontend tests: `packages/client/src/__tests__/sseStore.test.ts` exercises
  `useSseStore._handleEvent` against the real orgStore;
  `packages/client/src/__tests__/ConnectionStatusIndicator.test.tsx`
  verifies the status badge per state.

## Gotchas

- EventSource cannot attach Authorization headers, but it does send cookies
  on same-origin requests automatically. Auth is enforced via the
  `orgplanner.sid` session cookie now — no `?access_token=` needed.
- `app.ts` mounts `sseRoutes` BEFORE `orgRoutes` so the authenticated
  org router doesn't swallow `/orgs/:orgId/events`.
- Long-lived SSE connections are not reliable on Vercel serverless due to
  request timeouts; `/events/poll` is the Vercel-compatible fallback path.
- Always call `eventBus.reset()` in afterAll of SSE tests to avoid
  lingering clients pointing at torn-down servers.
