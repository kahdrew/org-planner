# Gong.io & Granola API Integration Research

**Prepared for:** org-planner sales forecasting application
**Date:** 2026-04-16
**Scope:** Authentication, endpoints, webhooks/events, rate limits, forecasting signals, and recommended integration approaches for Gong and Granola.

> **Conventions in this doc:** All claims are cited. Where vendor documentation is the primary source it is marked **[Vendor]**. Third-party/community sources are marked **[3P]**. Uncertainties and API-churn risk are called out explicitly.

---

## 1. Gong.io

### 1.1 Authentication

Gong exposes **two authentication modes** — choose by customer-base topology.

| Mode | Best for | Credential flow | Notes |
|---|---|---|---|
| **API Key + Access Key Secret** (HTTP Basic) | Internal/single-tenant apps, your-own-Gong-instance | `Settings → API → Get API Key` by a **Tech Admin** (hard requirement); Base64(access_key:secret) in `Authorization: Basic …` header | Simple. No user/tenant scoping beyond the org that issued the key. [Vendor: help.gong.io/docs/receive-access-to-the-api] [3P: claap.io/blog/gong-api] |
| **OAuth 2.0 (Authorization Code)** | Multi-tenant SaaS integrations listed on Gong Collective | Register an **Integration** in `Admin > Settings > Ecosystem > API`, receive `client_id`/`client_secret`; customer admin approves scopes; exchange code at `https://app.gong.io/oauth2/generate-customer-token`; receive `access_token` (1-day default) + `refresh_token` (long-lived) | Tokens are **org-level, not user-level** — “Gong doesn't support user level OAuth. Authentication happens once on a global level.” [Vendor: help.gong.io/docs/create-an-app-for-gong] |

**Multi-tenant considerations (critical for a forecasting SaaS):**

- The token response includes **`api_base_url_for_customer`** (e.g. `https://company-17.api.gong.io`). This URL differs per customer (data residency — US/EU/regional shards) and **must be persisted with each tenant's credentials**. Hitting `api.gong.io` instead of the tenant-specific base URL will fail. [Vendor]
- Scopes are space-delimited, e.g. `api:calls:create api:calls:read:basic`, `api:crm:*`, `api:stats:*`. Request least privilege. [Vendor]
- Refresh tokens renew both the access + refresh token; store both and rotate.

### 1.2 Core endpoints

Base URL (single-tenant, API key): `https://api.gong.io/v2/` — per-customer base URL for OAuth apps.

| Endpoint | Verb | Purpose / Notes |
|---|---|---|
| `/v2/calls` | GET | List calls. Filter by `fromDateTime`, `toDateTime`, `userId`, `workspaceId`, etc. Cursor pagination via `records.cursor`. |
| `/v2/calls/extensive` | POST | Rich filter + field selection (recommended for production pipelines — request specific data fields to reduce payload). |
| `/v2/calls/{id}` | GET | Full call metadata. |
| `/v2/calls/{id}/transcript` or `/v2/calls/transcript` | GET/POST | Return transcript segments with `speakerId`, `text`, `start` timestamps. |
| `/v2/calls/add` | POST | Upload a call recorded elsewhere for Gong to transcribe/analyze. |
| `/v2/users` / `/v2/users/{id}` | GET | User directory. |
| `/v2/users/{id}/stats` (or `/v2/stats/activity`, `/v2/stats/interaction`) | GET | Per-user activity and interaction stats (talk time, call counts). |
| `/v2/crm/object`, `/v2/crm/map-fields` | GET/POST | CRM object sync (Opportunity/Account/Contact/custom). |
| `/v2/meetings` | GET (Beta) | Scheduled meetings data. |
| `/v2/flows` (Engage API) | GET/POST/PUT | Engage outreach sequence management. Separate product. |
| Additional service groups | | `DataPrivacy`, `Library`, `Auditing`, `Permissions`, `DigitalInteractions`, `IntegrationSettings` |

Source: official API docs (authenticated-only at `gong.app.gong.io/settings/api/documentation`), [3P: claap.io/blog/gong-api], and the open-source OpenAPI-derived Node client’s service catalog [3P: github.com/aaronsb/gong-api-client].

Pagination: **cursor-based** — `records.cursor` included in each response until exhausted. [3P: aaronsb/gong-api-client]

### 1.3 Signals most valuable for forecasting

Gong itself documents exactly what its own “Deal Likelihood Score” model ingests — these are the signals we should mirror. **50 % conversation-intelligence signals, 50 % activity/contact/timing/historical signals, with per-deal dynamic weighting.** [Vendor: help.gong.io/docs/explainer-under-the-hood-of-deal-likelihood-scores]

| Category | Signals (extractable via API) | How/where |
|---|---|---|
| **Conversational content** | Mentions of legal, pricing, competitors; “red flags”; deal warnings; topics (`Integrations`, `Differentiation`, `Customer Success`, etc.) | `content.trackers[]` (name + count + phrases) and `content.topics[]` (name + duration) in call payload |
| **Talk dynamics** | Talk ratio, Longest Monologue, Longest Customer Story, **Interactivity**, **Patience** | `interaction.interactionStats[]` (values ~0.0–1.0 or seconds) |
| **Next-step commitments** | Scheduled next meeting, follow-up emails | Derived from `/meetings` + trackers like “Next Steps” / email activity from CRM sync |
| **Champion / multithreading** | Count of unique external contacts per deal; new stakeholders appearing mid-cycle; contact titles/seniority | `parties[]` across calls → CRM Contact objects in `context.objects` |
| **Risk flags** | Prospect ghosting (days since last touch), competitor mentions spiking, “legal/procurement” trackers appearing late, close-date slips, deal-amount changes | Derived by comparing call metadata + CRM snapshot over time |
| **Engagement activity** | Call count, email count, talk time, call duration per deal | `/stats/*`, CRM context on each call |
| **Historical/benchmarking** | Time in stage vs. won-deal median, rep win-rate, stage win-rate | Computed from Gong call history + CRM snapshots |

Recommended feature vector per opportunity for a forecasting model: rolling 7/14/30-day aggregations of the above, plus raw transcripts fed to an LLM for sentiment / commitment / objection extraction.

### 1.4 Webhooks / real-time events

**Model:** Gong uses **Automation Rules** (not a subscribe/topic style webhook system). A Tech Admin creates a rule in `Admin Center > Settings > Ecosystem > Automation Rules` that matches calls by filter criteria; when a call matches, Gong POSTs the full analyzed call payload to your URL. [Vendor: help.gong.io/docs/create-a-webhook-rule]

- **Trigger point:** fires **after analysis completes** (so you receive trackers, topics, interaction stats, CRM context — everything the analyzer produces).
- **Authentication options:** (a) URL includes a secure random token, or (b) **Signed JWT header** with a public key you validate. Prefer JWT for production. [Vendor]
- **Payload:** Identical structure to `/v2/calls` response. Contains `metaData`, `context[]` (CRM objects with field snapshots: `Opportunity.StageName`, `Amount`, `Probability`, `CloseDate`…), `parties[]` (with per-party CRM Contact context), `content.trackers[]`, `content.topics[]`, `interaction.speakers[]` + `interactionStats[]`, `collaboration.publicComments[]`. [Vendor: help.gong.io/docs/payload-sent-to-webhooks]
- **Filter DSL:** Same as the “Search for calls” UI — you can filter by workspace, users, duration, trackers, deal stage, outcome, etc.
- **No first-class “deal risk detected” event.** You get the raw analyzed call; risk detection must be computed downstream (or mirror Gong’s own deal likelihood score by polling `/v2/crm/object` for Deal Likelihood custom field if the Gong Forecast add-on is licensed). [Vendor]

**Operational caveats:**
- “Gong may, without prior warning, add fields to the JSON output… future proof your code so that it disregards JSON fields you don’t use.” — Vendor explicit note. [Vendor]
- No replay/retry API — if your endpoint is down, the delivery is lost. Build an idempotent receiver + nightly reconciliation sweep against `/v2/calls` with `fromDateTime >= last_success`.

### 1.5 Data model: Call → Opportunity linking

Gong links calls to CRM objects through calendar-email matching + CRM integration (Salesforce, HubSpot, Dynamics). In the webhook/call payload this appears as:

```jsonc
"context": [{
  "system": "Salesforce",
  "objects": [
    { "objectType": "Opportunity", "objectId": "0061Q...", "fields": [ {"name":"StageName"...}, {"name":"Amount"...}, {"name":"CloseDate"...} ] },
    { "objectType": "Account",     "objectId": "0011...",  "fields": [ ... ] }
  ]
}],
"parties": [
  { "emailAddress": "...", "affiliation": "External",
    "context": [{ "system":"Salesforce", "objects":[{"objectType":"Contact", ...}] }] }
]
```
[Vendor: payload-sent-to-webhooks]

Implications for a forecasting app:
- Opportunity is the stable join key between Gong call data and CRM snapshots.
- You can read CRM field values **at the time the call was recorded**, which is essential for time-travel / point-in-time forecast features.
- Custom CRM fields are included if Gong is configured to sync them.

### 1.6 Rate limits (2025 / 2026)

Official (authoritative): **3 requests/second and 10,000 requests/day per API key.** On 429, honor the `Retry-After` header. [Vendor: help.gong.io/docs/what-the-gong-api-provides — page updated Jul 28, 2025]

> **Uncertainty note:** Third-party guides (e.g., Claap, 2025-12) cite “≈1,000 requests/hour.” Treat the vendor page as canonical and always inspect response headers (`X-RateLimit-*`) for live budget. Plan for the 10k/day ceiling per tenant as the real constraint on batch pipelines.

### 1.7 Node.js / TypeScript client libraries

**No official Gong-maintained Node SDK.** Community options:

| Library | Notes | Source |
|---|---|---|
| `gong-api-client` (npm, TS) | Auto-generates a TS client from Gong’s OpenAPI spec; also supports plain axios Basic-auth path. Services: `CallsService`, `UsersService`, `StatsService`, `CRMService`, `MeetingsService` (beta), `EngageFlowsService`, `DataPrivacyService`, `LibraryService`, `AuditingService`, `PermissionsService`, `DigitalInteractionsService`, `IntegrationSettingsService`. Last release 1.0.3, Mar 2025; 1★. [3P: github.com/aaronsb/gong-api-client] |
| `gong-client` (Python — honorable mention) | Unofficial, for reference. [3P: github.com/ksindi/gong-client] |
| Integration platforms | **Nango**, **Tray.io**, **Workato**, **Prismatic**, **Knit**, **dlthub** all offer managed Gong connectors (useful for OAuth refresh, paging, and webhook relay without in-house plumbing). |

**Recommendation:** Given the low star count and 1-year-old last commit on `gong-api-client`, writing a **thin in-house TS client** against the OpenAPI spec (the spec is available from the vendor and can be pulled with `openapi-typescript` or `openapi-fetch`) is lower-risk than taking a hard dep on a sparsely maintained community SDK — or delegate to Nango if you need quick OAuth multi-tenant support.

### 1.8 How other forecasting apps integrate with Gong (pattern: Clari + Gong)

[Vendor/3P: clari.com/blog/clari-and-gong-io]

- Clari **pulls call metadata + transcripts + talk metrics** from Gong via API into the deal record; embeds deep links back to the Gong call.
- Conversation-intelligence signals are fed as features into Clari's **predictive deal scoring** — used alongside activity/history signals. Gong data is “about half the story” of the forecast in the Clari+Gong pairing.
- Bidirectional: Clari writes deal-health annotations that can be surfaced back in Gong deal views.
- Operational pattern: **nightly bulk sync via `/v2/calls/extensive`** for historical backfill + **webhook rule for new calls** for freshness, with CRM opportunity ID as the join key.

**Take-away for org-planner’s forecasting app:** Ingest once (historical), webhook for freshness, persist call→opportunity→account links as your own first-class entities, and treat Gong trackers/topics/interaction stats as a parallel feature store alongside CRM activity.

---

## 2. Granola (granola.ai)

### 2.1 Does Granola have a public API? — **Yes, Beta, as of 2025/2026.**

[Vendor: docs.granola.ai/introduction]

- **Base URL:** `https://public-api.granola.ai/v1/`
- **Status:** Beta — “endpoints and response shapes may change.” [3P: github.com/devli13/mcp-granola]
- **Announced/rolled out:** Personal API keys accessible in-app via `Settings → API`, with the official MCP server (remote OAuth) going live **Feb 4, 2026** per PulseMCP. [3P: pulsemcp.com/servers/granola]
- **Plan gating:**
  - **Personal API key** (Beta): any workspace member on **Business or Enterprise**; access limited to notes the user owns or has direct access to.
  - **Enterprise API key**: admin-only; access to all Team-space notes.
  - Enterprise admins can toggle “Allow personal API keys” in `Settings → Workspace`.

### 2.2 Authentication, endpoints, data shape

**Auth:** Bearer token — `Authorization: Bearer grn_YOUR_API_KEY` (keys prefixed `grn_`). [Vendor]

**Endpoints (public, v1):**

| Endpoint | Verb | Purpose |
|---|---|---|
| `/v1/notes` | GET | List notes. Query params: `created_after`, `created_before` (ISO 8601), `cursor` for pagination, `limit`. Only returns notes with **generated AI summary + transcript**. |
| `/v1/notes/{id}` | GET | Fetch a single note. Add `?include=transcript` for full diarized transcript. Note IDs look like `not_1d3tmYTlCICgjy` (not UUIDs). Returns 404 if the note is still processing or was never summarized. |

**Note shape (selected fields):**
```jsonc
{
  "id": "not_1d3tmYTlCICgjy",
  "title": "Quarterly yoghurt budget review",
  "owner": { "name": "...", "email": "..." },
  "summary": "Markdown enhanced summary ...",
  "transcript": [
    { "speaker": { "source": "microphone" }, "text": "..." },
    { "speaker": { "source": "speaker" },    "text": "..." }
  ]
}
```
On iOS, transcripts include `speaker.diarization_label` ("Speaker A/B/..."); on macOS transcripts are split into `microphone` (user) vs `speaker` (remote audio) sources. [Vendor]

**Notably absent (as of 2026-04-16):**
- **No webhook / events endpoint in the public API.** Confirmed by absence in docs + no mention in release notes. (Zapier triggers are app-internal, not public-API webhooks.)
- **No full-text search endpoint** — community MCPs do client-side substring search over recent notes. [3P: devli13/mcp-granola]
- **No explicit Opportunity/Deal linking** — there is no CRM concept inside the API. Linkage to a deal must be inferred from attendees' email domains or the calendar event title.
- **No write endpoints** — read-only as of Beta.

### 2.3 Rate limits

Per-workspace (or per-user for personal keys): **burst 25 requests / 5s window, sustained 5 req/s (≈300/min).** 429 returned when exceeded. [Vendor]

### 2.4 If no API: common integration patterns (still relevant)

Even with the Beta API, these remain in production at many Granola customers:

| Pattern | Mechanism | Fit for forecasting app |
|---|---|---|
| **Native integrations** | Slack, Notion, HubSpot, Affinity, Attio | Write-path to CRM — good for human consumption, not for feature extraction |
| **Zapier** | 2 triggers: *Note Added to Granola Folder*, *Note Shared to Zapier*; payload = title, creator, attendees, calendar event, my-notes, **summary (MD)**, **full transcript**, link | Fastest way to get webhook-like behavior until the API adds native webhooks; rate-limited + latency-prone |
| **Official Granola MCP server** | Remote MCP at `https://mcp.granola.ai/mc...`, OAuth, Streamable-HTTP transport — released Feb 4, 2026 | Use for AI-agent workflows (Claude, Cursor, etc.); not a fit for server-side pipelines of a forecasting app |
| **Community MCP servers** | `devli13/mcp-granola`, `pedramamini/GranolaMCP`, `btn0s/granola-mcp`, `0xSero/granola`, etc. Several read the **local cache file** at `~/Library/Application Support/Granola/` — desktop-only | Useful for local prototypes; not a production server integration |
| **Local file / cache** | `~/Library/Application Support/Granola/` stores notes/transcripts JSON | Fine for individual user scripts, not for multi-tenant SaaS |
| **Manual export** | `serialjoy/granolatranscripts` exports to Markdown | Not automatable |

[Sources: 3P — granola.ai/blog, pulsemcp.com/servers/granola, glama.ai, github.com/serialjoy/granolatranscripts]

### 2.5 Granola MCP (Model Context Protocol)

**Yes — an official Granola MCP server exists** (launched Feb 4, 2026). [3P: pulsemcp.com/servers/granola; Vendor blog: granola.ai/blog/granola-mcp]

- **URL:** `https://mcp.granola.ai/mc...` (remote MCP endpoint)
- **Auth:** OAuth (no static API key required for the MCP flow)
- **Transport:** Streamable HTTP (current MCP spec)
- **Pricing:** Free tier available; paid plans for higher usage.
- **Capabilities:** search notes, list notes with date filters, fetch a note (with transcript). Mirrors the public REST API but framed for AI-agent tool-use.

This is primarily useful if your forecasting app embeds an **AI agent / copilot** that reasons over a rep's Granola history. For deterministic server-side ingestion, prefer the REST API (`public-api.granola.ai/v1/*`).

### 2.6 Forecasting signals available from Granola

| Signal | Availability via public API | Notes |
|---|---|---|
| **Meeting summary (enhanced, Markdown)** | ✅ `summary` field | LLM-friendly; already contains next-steps / action items if Granola's generator detected them |
| **Full transcript** | ✅ `?include=transcript` | Diarization on iOS (anonymous Speaker A/B); mic/speaker split on macOS |
| **Meeting title** | ✅ `title` | Often mirrors calendar event — useful for attempted Opportunity matching |
| **Creator** | ✅ `owner.{name,email}` | Rep identity |
| **Attendees** | ⚠️ Not in public API documented fields; available in Zapier payload | Gap — must enrich via calendar API (Google/Outlook) |
| **Calendar event (title + date/time)** | ⚠️ Not explicit in REST; present in Zapier payload | Gap |
| **My Notes (private notes)** | ⚠️ In Zapier payload; unclear REST exposure | May be the highest-signal for commitments (rep's own next-steps) |
| **Action items / next steps** | ❌ Not a structured field; embedded in `summary` Markdown | Parse with LLM or regex |
| **Champion identification / sentiment / competitor mentions** | ❌ No analyzer output | Must run our own NLP on transcript |
| **Deal / opportunity linking** | ❌ No CRM concept | Infer via attendee email domain → Account → open Opportunity |
| **Talk ratio / interaction stats** | ❌ Not computed by Granola | Compute from diarized transcript if needed |

**Bottom line:** Granola is a **raw-content** source (notes + transcript). It contributes signal to forecasting only after we apply our own extraction (LLM classification for commitments, objections, champion identification, action items). It does **not** provide pre-computed conversation-intelligence scores like Gong does.

### 2.7 Recommended integration approach for Granola

**Given:** public REST API is Beta (read-only, no webhooks, workspace/user-scoped keys), Granola is notes-first (not deal-first).

1. **Primary ingestion: REST API poll + Zapier backstop for real-time.**
   - For each user/workspace that connects, store `grn_…` key (Personal key for individual reps; Enterprise key for org-wide deployments). Encrypt at rest.
   - Poll `/v1/notes?created_after={last_sync}` every 5–15 minutes per tenant (well within 5 req/s budget). Fetch new notes individually with `?include=transcript`.
   - **Real-time parity:** have customers optionally set up a Zapier Zap (*Note Added to Folder*) to POST to our `/webhooks/granola` endpoint; this closes the ~10-minute polling gap for teams that need it. Zapier payload already includes summary + transcript.
2. **Deal linking = our responsibility.** Build an enrichment step that:
   - Extracts external attendee email domains.
   - Matches to accounts/opportunities in the user’s CRM via our existing CRM connectors (Salesforce/HubSpot).
   - Stores the (Note ↔ Opportunity) mapping as a first-class join entity so forecasts can weight Granola signal per deal.
3. **Feature extraction over transcript + summary:**
   - LLM-based pass: extract action items, next-step commitments (who / what / by when), objections, competitor mentions, stakeholders introduced.
   - Store as structured signal rows keyed by `(opportunity_id, note_id, extracted_at)`.
4. **Defensive posture toward API churn** — Beta API, expect breaking changes:
   - Pin a client version; wrap responses in a DTO layer; log unknown fields for visibility; set up contract tests that re-run weekly.
5. **Consider the official Granola MCP** only if/when we ship an AI copilot UI inside the forecasting app; for ETL, stick with REST.
6. **Avoid local-cache integrations** (`~/Library/Application Support/Granola/`) — they don't scale to multi-tenant SaaS and leak across user installs.

---

## 3. Side-by-side recommendation for org-planner

| Concern | **Gong** | **Granola** |
|---|---|---|
| **API maturity** | GA, documented, OpenAPI spec available | Beta (expect churn) |
| **Auth for multi-tenant SaaS** | OAuth 2.0 app (tenant-scoped, `api_base_url_for_customer`) | Bearer API key per workspace / per user; no OAuth for REST (official MCP does OAuth) |
| **Real-time ingestion** | Webhook Automation Rule (JWT-signed) | None native — use REST polling + Zapier as bridge |
| **Pre-computed forecasting signals** | Rich: trackers, topics, interaction stats, deal likelihood | None — raw summary + transcript only |
| **Deal/Opportunity linking** | First-class (CRM objects embedded in call payloads) | None — must enrich via attendees + our CRM |
| **Rate limits (per tenant)** | 3/s, 10k/day | 5/s sustained, 25/5s burst |
| **Node.js SDK** | No official SDK; community `gong-api-client` (1★) or roll-own from OpenAPI | No official SDK; simple fetch suffices |
| **Integration effort** | Medium-High (OAuth + webhook pipeline + CRM mapping) | Medium (polling + LLM extraction + CRM enrichment) |

---

## 4. Sources

### Vendor / official

1. **Gong — What the Gong API provides** (rate limits, scope) — https://help.gong.io/docs/what-the-gong-api-provides (updated Jul 28, 2025)
2. **Gong — Create an OAuth app for Gong** (OAuth flow, token exchange, `api_base_url_for_customer`) — https://help.gong.io/docs/create-an-app-for-gong (updated Jan 18, 2026)
3. **Gong — Receive access to the API** (API key auth) — https://help.gong.io/docs/receive-access-to-the-api
4. **Gong — Create a webhook rule** (webhook-via-rules pattern) — https://help.gong.io/docs/create-a-webhook-rule (updated Jan 18, 2026)
5. **Gong — Payload sent to webhooks** (JSON shape, CRM context) — https://help.gong.io/docs/payload-sent-to-webhooks
6. **Gong — Under the hood of deal likelihood scores** (signal categories used by Gong’s own model) — https://help.gong.io/docs/explainer-under-the-hood-of-deal-likelihood-scores (updated Feb 25, 2026)
7. **Granola API docs (Introduction)** — https://docs.granola.ai/introduction
8. **Granola — Zapier integration** (webhook payload shape) — https://docs.granola.ai/help-center/sharing/integrations/zapier
9. **Granola — Integrations complete guide** — https://www.granola.ai/blog/granola-integrations-complete-guide-connecting-meeting-notes (2026-03-20; partial fetch — site JS-rendered, content summarized from search snippet)

### Third-party / community

10. **Claap — Gong API complete developer guide (2026)** — https://www.claap.io/blog/gong-api (third-party; useful for code samples; rate-limit figure disagrees with vendor and should be ignored)
11. **aaronsb/gong-api-client (Node/TS)** — https://github.com/aaronsb/gong-api-client
12. **Clari + Gong integration announcement** — https://www.clari.com/blog/clari-and-gong-io/
13. **Official Granola MCP server (PulseMCP listing)** — https://www.pulsemcp.com/servers/granola (released Feb 4, 2026)
14. **devli13/mcp-granola (community Granola MCP)** — https://glama.ai/mcp/servers/devli13/mcp-granola (confirms `grn_` key format and Beta status)
15. **shardulbansal/GranolaMCP (local-cache MCP)** — https://lobehub.com/mcp/shardulbansal-granolamcp (confirms local cache path `~/Library/Application Support/Granola/`)
16. **owengretzinger/granola-webhook** — https://github.com/owengretzinger/granola-webhook (community workaround for pre-native-webhook era)
17. **TechCrunch — Granola $125M / $1.5B valuation (Mar 25, 2026)** — https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation (context: platform is investing in agent/integration surface; expect API to mature)

### Uncertainties / assumptions

- Gong rate-limits cited as 3/s + 10k/day from the vendor KB (updated 2025-07-28). The vendor’s interactive API docs (`gong.app.gong.io/settings/api/documentation`) require auth and were not directly reached; treat the KB numbers as authoritative for this report.
- Granola REST attendee/calendar-event exposure outside of Zapier is not explicitly documented in the public docs page we captured; the List-Notes and Get-Note reference pages exist (`docs.granola.ai/api-reference/...`) but were not individually fetched.
- Granola API is explicitly **Beta**; all shapes above should be version-pinned and monitored.
