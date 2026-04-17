# Salesforce + Apollo.io Integration Research Report

_Prepared for org-planner sales forecasting application_
_Date: 2026-04-16_
_Scope: Research to inform the design of mock/fixture-first integration layers whose
interfaces must match the real Salesforce and Apollo.io APIs so real API keys can be
plugged in later._

---

## 1. Salesforce

### 1.1 Authentication — OAuth 2.0 Flows

Salesforce supports the full family of OAuth 2.0 flows. The options relevant to a
server-side, multi-tenant forecasting app are:

| Flow | Description | Multi-tenant fit |
|------|-------------|------------------|
| **Web Server Flow (Authorization Code + PKCE)** | Standard three-legged OAuth; user signs into Salesforce and consents to the Connected App. The app exchanges an auth code for access + refresh tokens. | ✅ Best default for multi-tenant SaaS because each customer authorizes once and we store per-tenant refresh tokens. |
| **JWT Bearer Flow** | Server signs a JWT with a private key tied to a certificate uploaded to the Connected App; trades it for an access token on behalf of a pre-authorized user. No browser step, no refresh token. | ✅ Strong choice for background jobs (bulk sync, nightly forecast refresh) but requires each tenant to pre-authorize the Connected App once (admin consent) and to provision a specific integration user. |
| **Username-Password Flow** | App posts username + password + security token. | ❌ Officially **deprecated / disabled by default for new Connected Apps** since Winter '24. Don't use. |
| **Client Credentials Flow** | Server-to-server, tied to a specific integration user configured on the Connected App. | ⚠️ Good for single-org tools; awkward per-tenant because the integration user is defined at the Connected App level, so it works best when each tenant installs your managed package. |
| **Device Flow** | For headless devices without browsers. | ❌ Not relevant. |
| **Refresh Token Flow** | Renews access tokens obtained via the Web Server or User-Agent flows. | ✅ Required companion to Web Server flow. |

**Recommendation for org-planner:**
- **Primary:** Web Server Flow (Authorization Code + PKCE) — each tenant admin installs a
  Connected App, consents once, and we store a refresh token per tenant. Tokens refresh
  transparently; the user experience is a standard "Connect Salesforce" button.
- **Secondary (for high-volume background sync):** JWT Bearer Flow layered on top of the
  same Connected App, using a dedicated integration user that each tenant provisions. This
  avoids refresh-token expiry and scales well for Bulk API jobs.

**Connected App setup checklist (per tenant):**
1. Setup → App Manager → **New Connected App**.
2. Enable OAuth Settings → add callback URL → select scopes (`api`, `refresh_token`,
   `offline_access`, `chatter_api` if needed; `full` only if strictly required).
3. For JWT: upload an X.509 certificate (public key), enable "Use digital signatures",
   set "Permitted Users" to _Admin approved users are pre-authorized_.
4. Capture **Consumer Key** (client_id) and **Consumer Secret** (client_secret).
5. On tenant side: admin installs the Connected App or pre-authorizes via profile /
   permission set.

**Sources**
- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_jwt_flow.htm
- https://sfdcdevelopers.com/2025/09/24/what-different-oauth2-0-authorization-flows/
- https://sfdcdevelopers.com/2026/01/13/salesforce-jwt-flow-guide/
- https://www.apexhours.com/salesforce-oauth-2-0-jwt-bearer-flow/

---

### 1.2 API Types — When to Use Which

| API | Protocol | Best for | Notes |
|-----|----------|----------|-------|
| **REST API** | REST/JSON, synchronous | Low-volume CRUD, interactive UI actions, SOQL/SOSL queries, ad-hoc single-record reads. | Up to 200 records per operation; counts toward daily API limit per request. |
| **Bulk API 2.0** | REST/JSON, asynchronous jobs | Loading or extracting >10k records (initial backfill, nightly refreshes of Opportunity + history). | 150M records/24 h per org; one HTTP call per job rather than per record; results polled or streamed back as CSV. Separate limits from the daily API request pool. |
| **Composite API** | REST/JSON, synchronous | Multi-step operations that must be atomic or that need to round-trip ≤25 sub-requests in a single call (e.g., create Opportunity + Line Items + tasks). | `/composite`, `/composite/tree` (nested create), `/composite/batch` (independent requests), `/composite/sobjects` (up to 200 records with partial success). Counts sub-requests toward API limits but reduces HTTP overhead. |
| **GraphQL API** | GraphQL | Shape-fit queries where the client wants specific field subsets. | Still newer; useful but not required for this project. |
| **Metadata API / Tooling API** | SOAP + REST | Retrieve CustomField definitions, describe custom fields per tenant. | Use for schema discovery / field mapping UIs. |
| **Streaming API (CometD)** | Long polling | Legacy PushTopic / generic streaming. | Being superseded by Pub/Sub API. |
| **Pub/Sub API** | gRPC + HTTP/2, Avro binary | Real-time subscription to Platform Events, Change Data Capture (CDC), and real-time event monitoring. Supports flow-controlled pull subscriptions and publishing. | Preferred modern streaming surface. SDKs in Node, Python, Java, C++, etc. |
| **Change Data Capture (CDC)** | Delivered via Pub/Sub or Streaming | Real-time sync of record CRUD across subscribed objects. | Ideal for near-real-time forecasting updates when Opportunities change. |
| **Platform Events** | Delivered via Pub/Sub or Streaming | Custom business events published by Apex triggers / flows. | Good for tenant-specific workflows ("forecast locked", "deal slipped"). |
| **Outbound Messaging** | SOAP push (legacy) | Simple point-to-point HTTP notifications defined in Workflow Rules. | Only supports SOAP XML, no modern retries / replay. Generally avoid for new integrations. |

**Recommendation matrix for forecasting app:**
- **Initial backfill:** Bulk API 2.0 (extract Opportunity, OpportunityHistory, Account,
  Contact, User, OpportunityLineItem, Product2, Pricebook2 via SOQL queries).
- **Ongoing deltas (delta pull every 5–15 min):** REST API with
  `LastModifiedDate >= :checkpoint` SOQL (simple, idempotent).
- **Real-time push (opt-in):** Pub/Sub API subscribing to **Opportunity CDC** and
  **OpportunityHistory CDC** (and optional custom Platform Events).
- **Multi-step writes (rare — creating forecast snapshots back to SF):** Composite API.
- **Schema discovery (for custom field mapping UI):** `sobjects/{name}/describe` REST
  endpoint.

**Sources**
- https://developer.salesforce.com/blogs/2022/12/processing-large-amounts-of-data-part-2
- https://sfdcprep.com/salesforce-api-rest-soap-bulk-composite-graphql-guide/
- https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/
- https://sfdcdevelopers.com/2025/11/01/what-are-rest-api-composite-resources/
- https://developer.salesforce.com/docs/platform/pub-sub-api/overview
- https://sfdcprep.com/salesforce-platform-events-vs-change-data-capture-use-cases/

---

### 1.3 Core Objects for Forecasting — Key Fields

| Object | Purpose | Critical fields for forecasting |
|--------|---------|---------------------------------|
| **Opportunity** | The deal itself; central forecasting entity. | `Id`, `Name`, `AccountId`, `OwnerId`, `StageName`, `Amount`, `ExpectedRevenue`, `Probability`, `CloseDate`, `ForecastCategory`, `ForecastCategoryName`, `Type`, `LeadSource`, `IsClosed`, `IsWon`, `FiscalYear`, `FiscalQuarter`, `CreatedDate`, `LastModifiedDate`, `NextStep`. |
| **Account** | Company associated with the opportunity. | `Id`, `Name`, `Industry`, `AnnualRevenue`, `NumberOfEmployees`, `Type`, `OwnerId`, `BillingCountry`, `Website`. |
| **Contact** | Person at the account; forecast signal (champion/decision maker). | `Id`, `AccountId`, `Email`, `Title`, `Department`, `OwnerId`, `LeadSource`. |
| **User** | The rep / manager who owns the opportunity; needed for rollups. | `Id`, `Name`, `Email`, `ManagerId`, `UserRoleId`, `IsActive`, `ProfileId`. |
| **OpportunityLineItem** | Products attached to an opportunity (quantity, price). | `Id`, `OpportunityId`, `PricebookEntryId`, `Product2Id`, `Quantity`, `UnitPrice`, `TotalPrice`, `ServiceDate`, `Description`. Junction between Opportunity and PricebookEntry; supports schedule-based revenue. |
| **Product2** | Catalog record for the product. | `Id`, `Name`, `ProductCode`, `Family`, `IsActive`, `Description`. |
| **Pricebook2** | Catalog of pricebook entries; opportunities reference one. | `Id`, `Name`, `IsActive`, `IsStandard`. |
| **PricebookEntry** _(join)_ | Specific product price within a Pricebook2. | `Id`, `Pricebook2Id`, `Product2Id`, `UnitPrice`, `IsActive`, `CurrencyIsoCode`. |
| **OpportunityHistory** | Read-only; one row every time `StageName`, `Amount`, `Probability`, `CloseDate`, or `ForecastCategory` changes on an opportunity. Essential for forecast accuracy analytics (slippage, stage duration, velocity). | `Id`, `OpportunityId`, `StageName`, `Amount`, `Probability`, `CloseDate`, `ForecastCategory`, `CreatedDate`, `SystemModstamp`, `ExpectedRevenue`. |
| **OpportunityFieldHistory** | Tracks changes on any field enabled for field history. | `Id`, `OpportunityId`, `Field`, `OldValue`, `NewValue`, `CreatedDate`. |
| **OpportunityStage** | Picklist-backed metadata describing each stage (probability, forecast category mapping). | `MasterLabel`, `ApiName`, `DefaultProbability`, `ForecastCategoryName`, `IsActive`, `IsClosed`, `IsWon`, `SortOrder`. |

**Stage / forecast category mapping:** Every stage rolls up into one of five standard
forecast categories: **Pipeline, Best Case, Commit, Closed, Omitted** (the labels are
customizable per tenant). Our forecasting engine must read `OpportunityStage` per tenant
to understand how stages map, not assume defaults.

**Sources**
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunity.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunitylineitem.htm
- https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf (Pipeline Forecasting Implementation Guide, Spring '26)
- https://ascendix.com/blog/salesforce-opportunity-stages/
- https://garysmithpartnership.com/opportunity-stages/

---

### 1.4 Custom Fields — Discovery and Mapping

Every Salesforce org extends objects with custom fields (API name suffix `__c`). Because
forecasting apps live or die on custom attributes (e.g., `Deal_Confidence__c`,
`Renewal_Risk__c`), the integration layer must discover and map these dynamically.

**Two complementary APIs:**
1. **sObject Describe (REST)** — `GET /services/data/vXX.0/sobjects/Opportunity/describe`
   returns every field (standard and custom) with `name`, `label`, `type`, `picklist
   values`, `referenceTo`, `calculated`, `nillable`, etc. Fast; adequate for runtime
   field mapping.
2. **Metadata API / Tooling API — `CustomField` type** — deeper inspection: who created
   a field, formulas, validation rules, field history tracking flags. Useful for admin UX
   ("field last modified by…") but heavier to query.

**Field mapping strategy for org-planner:**
- At tenant onboarding, call `describe` on each tracked object; persist a
  `tenant_field_catalog` (object name → field metadata) in our DB.
- Let admins choose which custom fields flow into forecast features (e.g., "map
  `Deal_Confidence__c` → internal `deal_confidence` numeric feature").
- At sync time, issue a dynamic SOQL that includes only standard fields **plus** mapped
  custom fields.
- Re-run `describe` on a schedule (e.g., daily) or subscribe to CDC on `CustomField` via
  Tooling API to detect schema drift.
- Use `namespacePrefix` to respect managed-package custom fields (e.g., `ns__Field__c`).

**Sources**
- https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_sobject_describe.htm
- https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_sobject_describe.htm
- https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm

---

### 1.5 Salesforce Forecast Objects — Use Native vs. Build Our Own?

Salesforce ships a **Collaborative / Pipeline Forecasting** module with these objects
(API v30+ for most; v52+ for newer ones):

| Object | What it represents |
|--------|--------------------|
| **ForecastingType** | A forecasting configuration (e.g., Opportunity Revenue by Territory, Line Item by Product Family). Ties together the other Forecasting objects. |
| **ForecastingItem** | **Read-only** pre-rolled amounts by user, period, and forecast category for a given ForecastingType. Salesforce computes these; you cannot write. |
| **ForecastingFact** | The raw calculated fact for an individual item, including amount, ownership, and period. |
| **ForecastingQuota** | An individual user's or territory's quota for a period. Writable with "Managed Quotas" permission. |
| **ForecastingAdjustment** | A manager's adjustment to a subordinate's forecast number. |
| **ForecastingOwnerAdjustment** | A user's adjustment to their own forecast number. |
| **ForecastingShare** | Sharing of forecast visibility across the hierarchy. |

**When they help:**
- If a customer already uses native Collaborative Forecasting, reading `ForecastingItem`
  + `ForecastingQuota` lets us import their existing rollups, hierarchy, and quotas
  without rebuilding the model.
- `ForecastingType` is the gateway — we must pick a type and all other objects filter
  through it.

**When to build our own forecast instead:**
- Native forecasting requires specific editions (Enterprise+), specific features enabled,
  and a forecasting hierarchy set up. Many orgs never configure it.
- Our value prop (ML-driven forecasts, cross-team what-if analysis, scenario planning)
  **exceeds** what native forecasting provides.
- Calculation logic inside ForecastingItem is opaque; for transparent + explainable
  forecasts, we compute from raw Opportunity + OpportunityHistory.

**Recommendation:** Build our own forecast model from Opportunity + OpportunityHistory
+ OpportunityStage + User hierarchy. **Optionally** import ForecastingQuota (and
ForecastingItem for a "Salesforce says" comparison column) when the tenant has native
forecasting enabled. Treat Forecasting objects as a _secondary data source_, not the
source of truth.

**Sources**
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingitem.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingtype.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingquota.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingadjustment.htm
- https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf

---

### 1.6 Rate Limits & Governor Limits (2025/2026)

**Per-org daily API request allocation (Salesforce REST/SOAP API pool):**

| Edition | Daily allocation |
|---------|------------------|
| Developer Edition | 15,000 / 24 h |
| Professional Edition (API add-on) | 1,000 × licensed user, capped per tier |
| Enterprise Edition | 1,000 × licensed user (min 15,000) + 100,000 additional flat |
| Unlimited / Performance | 5,000 × licensed user + 100,000 flat |

These pool across REST, SOAP, Composite (each sub-request counts), and certain Bulk API
operations. **Bulk API 2.0 job processing** has its own allocation of 150M records /
24 h for most paid editions.

**Concurrent request limits (per org):**
- 25 long-running synchronous API requests (>20 s) concurrently before queuing.
- Composite API: 25 sub-requests per `/composite` call.
- Composite Graph: 500 nodes per graph, 75 graphs per request.

**Pub/Sub API limits:**
- Daily delivery allocation of CDC and Platform Event messages scales with edition (e.g.,
  Enterprise: 250k events/day; Unlimited: 1M events/day for Standard-Volume events).
- Keepalive pings & flow-controlled pull subscriptions prevent runaway consumption.

**Other governor-like constraints:**
- SOQL query: 200,000 character limit; 2,000 records per REST call without pagination
  token; 50,000 records max per SOSL.
- `Query More` / `nextRecordsUrl` for paging.
- Apex heap / CPU limits only matter if we run logic inside SF (we shouldn't).

**Client-side implications:**
- Track per-tenant remaining limit: every REST response returns `Sforce-Limit-Info:
  api-usage=1234/15000` header.
- Our integration layer should degrade gracefully (switch to Bulk, spread writes with
  Composite, fallback to nightly delta) as usage climbs.
- Expose a "Salesforce API usage" widget per tenant in admin UI.

**Sources**
- https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/
- https://developer.salesforce.com/blogs/2024/11/api-limits-and-monitoring-your-api-usage
- https://coefficient.io/salesforce-api/salesforce-api-rate-limits (updated 2025-08)
- https://forcenaut.com/blog/salesforce-api-limits-guide/ (updated 2026-02)
- https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_app_limits_cheatsheet.pdf

---

### 1.7 Real-Time Updates — Webhooks, Outbound Messaging, Platform Events

Salesforce does not offer generic HTTP webhooks out of the box. The equivalent patterns
are:

| Mechanism | Real-time | Push vs. pull | Recommended? |
|-----------|-----------|---------------|--------------|
| **Pub/Sub API + CDC** | ✅ seconds | Pull (we subscribe) | **✅ Preferred.** Use for Opportunity + OpportunityHistory + User updates. Avro over gRPC; supports replay from an earlier event ID for resilience. |
| **Pub/Sub API + Platform Events** | ✅ seconds | Pull | ✅ Great for custom domain events emitted by Apex triggers or flows (e.g., forecast locked). |
| **Streaming API (legacy PushTopic / CometD)** | ✅ seconds | Pull via long poll | ⚠️ Being phased out. Only use if Pub/Sub is unavailable. |
| **Outbound Messaging** | ✅ near real-time | Push (SOAP XML) | ⚠️ Legacy, SOAP-only, limited retries (24 h queue). Only useful when we absolutely need SF to initiate an HTTP POST. |
| **Apex HTTP Callouts (via Flow)** | ✅ near real-time | Push (any payload) | ⚠️ Admins can build bespoke webhooks via Flow → HTTP Callout. Not part of standard integration, but a possible fallback when admins cannot enable Pub/Sub. |
| **Scheduled Apex / report-based polling** | ❌ batch | Pull | Fallback for orgs without real-time capability. |

**Recommendation:** Build the default path on **Pub/Sub API + CDC**. Node.js client:
`@salesforce/salesforce-pub-sub-api` or the generic gRPC + Avro stack (see §1.8).
Persist last-seen replay IDs per tenant per channel for resumable streaming.

**Sources**
- https://developer.salesforce.com/docs/platform/pub-sub-api/overview
- https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html
- https://sfdcprep.com/salesforce-platform-events-vs-change-data-capture-use-cases/
- https://sfdcprep.com/salesforce-webhooks-platform-events-callouts/
- https://salesforcecodex.com/salesforce/salesforce-outbound-message-vs-platform-event/

---

### 1.8 Node.js Libraries

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **`jsforce` (v3.10.x, published Feb 2026)** | Mature, broad coverage (REST, Bulk 1/2, Streaming, SOAP-like Metadata, OAuth flows, SOQL query cursors), well-typed, huge community (504 dependent packages). | Historically monolithic; browser + Node bundled. | ✅ Primary client for REST/Bulk/Metadata/SOQL. |
| **`@jsforce/jsforce-node` (v3.10.x, latest Apr 2026)** | Node-only build of jsforce v3 — tree-shakable, smaller, same API. | Slightly newer; fewer extras than `jsforce`. | ✅ Prefer this in the Node server package (avoids shipping browser code). |
| **`@salesforce/core`** | First-party CLI core (Salesforce DX). Handles auth, config, connection caching. | Designed for CLI/DevOps (scratch orgs, source pull/push) rather than runtime data sync. | ✅ Use **only** for sfdx-related tasks (scratch org provisioning, CI). |
| **Raw `fetch`** | Zero deps; full control over retries, observability. | We reinvent OAuth refresh, SOQL pagination, Bulk job polling, Pub/Sub gRPC/Avro handling. | ⚠️ Only for one-off edge cases; not recommended as baseline. |
| **`@salesforce/salesforce-pub-sub-api` (sample) / direct gRPC stack** | Official sample Node client. | Alpha-ish, minimal. | ✅ Starting point for Pub/Sub subscription service. |
| **`@apollo/client`** ❌ | _Unrelated (GraphQL). Easy to confuse by name; not a Salesforce client._ |  | Not applicable. |

**Trade-offs summary:**
- Single library for 80% of work: `@jsforce/jsforce-node`.
- Pub/Sub / CDC: separate microservice using gRPC + Avro + protobufs from Salesforce
  (jsforce covers classic Streaming API but Pub/Sub is recommended).
- `@salesforce/core` stays in devDependencies for scratch-org automation.

**Sources**
- https://www.npmjs.com/package/jsforce
- https://www.npmjs.com/package/@jsforce/jsforce-node
- https://github.com/jsforce/jsforce
- https://dev.to/steckdev/using-salesforce-subscriber-in-nodejs-typescript-using-jsforce
- https://developer.salesforce.com/blogs/2022/04/how-to-use-typescript-with-salesforce

---

### 1.9 Dev Environment — Sandbox vs. Scratch Org

| Option | Lifetime | Best for |
|--------|----------|----------|
| **Developer Edition org** | Permanent, free | Long-lived test org for integration demos / support. |
| **Sandbox (Dev/Dev Pro/Partial Copy/Full Copy)** | Attached to a production org, refreshable | Realistic fixtures, QA with anonymized production data. |
| **Scratch Org** | 1–30 days, disposable | CI / ephemeral testing; define shape via `project-scratch-def.json`. |
| **Trailhead Playgrounds** | ~30 days, free | Quick individual experiments. |

**Recommended dev workflow:**
1. Free **Developer Edition** org for local mock-vs-real validation.
2. **Scratch orgs** driven by `@salesforce/cli` (`sf org create scratch`) in CI for
   integration tests. Seeded with fixture Opportunity + OpportunityHistory data via
   Bulk API load.
3. A **full-copy sandbox** is nice-to-have for customer-mirroring load tests.

**Sources**
- https://www.salesforceben.com/salesforce-scratch-orgs/ (2026-01-26)
- https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs.htm
- https://moldstud.com/articles/p-scratch-orgs-vs-sandboxes-which-is-best-for-remote-salesforce

---

## 2. Apollo.io

### 2.1 Authentication

Apollo.io uses **API key auth** as the primary mechanism; **OAuth 2.0** is reserved for
official partners:

| Mechanism | Audience | Shape |
|-----------|----------|-------|
| **API key (per-Apollo-account)** | Customer building their own integration. | Header `X-Api-Key: <key>` (or `Api-Key`). Keys are scoped — when creating a key you explicitly enable which endpoints it can hit. |
| **Master API key** | Same, but toggles access to _every_ endpoint, including sensitive admin endpoints (`Get a List of Users`). | Same header shape. Use sparingly and never from a browser. |
| **OAuth 2.0 authorization code flow** | Apollo **partners** building integrations used by multiple mutual customers. Requires applying to Apollo's Marketplace. | Standard 3-legged OAuth 2.0. |

**Recommendation:**
- During early development and single-tenant pilots: **each tenant generates an API key**
  in their Apollo Settings → Integrations → API and pastes it into org-planner. We store
  encrypted per tenant.
- Long term, if we list on Apollo's Marketplace, adopt OAuth 2.0 partner flow so tenants
  can click "Connect Apollo" without manual key paste.
- **Never expose the master key in client code.** All Apollo calls must run server-side.

**Sources**
- https://docs.apollo.io/reference/authentication
- https://docs.apollo.io/docs/create-api-key
- https://docs.apollo.io/docs/use-oauth-20-authorization-flow-to-access-apollo-user-information-partners
- https://docs.apollo.io/docs/api-overview

---

### 2.2 Key Endpoints for Sales Forecasting

| Endpoint | Method + Path | Purpose |
|----------|---------------|---------|
| **People Search** | `POST /v1/mixed_people/search` (aka `/api/v1/mixed_people/search`) | Find people matching filters (title, seniority, industry, location). Credit-consuming. |
| **Organization Search** | `POST /v1/mixed_companies/search` | Find companies by filters (industry, size, tech stack, location). Credit-consuming. |
| **People Enrichment** | `POST /api/v1/people/match` | Enrich a single person by email, LinkedIn URL, name + org, etc. Returns full person + contact + organization object. Credit-consuming. |
| **Bulk People Enrichment** | `POST /api/v1/people/bulk_match` | Enrich up to 10 people per call (plan-dependent). Credit-consuming. |
| **Organization Enrichment** | `POST /v1/organizations/enrich` | Enrich a single company (domain or name). Credit-consuming. |
| **Bulk Organization Enrichment** | `POST /v1/organizations/bulk_enrich` | Up to 10 orgs per call. |
| **Get Person Details** | `GET /v1/people/{id}` | Look up a specific person by Apollo id. Credit-consuming. |
| **Get Organization Details** | `GET /v1/organizations/{id}` | Look up a specific org. Credit-consuming. |
| **Organization Job Postings** | `GET /v1/organizations/{org_id}/job_postings` | Hiring intent signals — **very useful forecasting feature.** Credit-consuming. |
| **News Articles Search** | `POST /v1/news_articles/search` | Company news events (fundraising, leadership change). Credit-consuming. |
| **Sequences** | `GET/POST /v1/emailer_campaigns` (and related) | List sequences, create, add contacts, pause. |
| **Contact Stages** | `GET /v1/contact_stages` | Tenant-defined contact lifecycle stages. |
| **Accounts (Apollo's internal account object)** | `GET/POST/PATCH /v1/accounts` | Manage Apollo accounts (distinct from CRM accounts). |
| **Tasks & Activities** | `GET /v1/activities`, `GET /v1/emailer_messages` | Pull email / call / meeting activity for attribution. |
| **Users** | `GET /v1/users/search` (master key only) | List Apollo seats; map to our User table. |
| **Email Accounts** | `GET /v1/email_accounts` | Mailbox-level stats (deliverability). |
| **API Usage Stats** | `GET /v1/usage_stats` | Returns current rate limit headroom — **call at startup to render tenant quota health.** |

**For forecasting context, the must-have endpoints are:**
1. **Account enrichment** (`/organizations/enrich`) — hydrate SF Account with
   industry, size, funding, tech stack, revenue range → input features for win-rate ML.
2. **People enrichment** (`/people/match`) — enrich SF Contact with seniority,
   department, tenure, LinkedIn → champion / decision-maker strength signals.
3. **Job postings** (`/organizations/{id}/job_postings`) and **news search** —
   lagging / leading indicators of buying intent.
4. **Sequences + activity** (`/emailer_campaigns`, `/emailer_messages`,
   `/activities`) — engagement signals (emails sent/opened/replied, calls made).
5. **API Usage Stats** for ops.

**Sources**
- https://docs.apollo.io/docs/api-overview
- https://docs.apollo.io/reference/people-enrichment
- https://docs.apollo.io/reference/bulk-people-enrichment
- https://docs.apollo.io/reference/organization-enrichment
- https://docs.apollo.io/reference/people-api-search
- https://docs.apollo.io/reference/view-api-usage-stats
- https://docs.apollo.io/docs/api-pricing

---

### 2.3 Rate Limits per Plan

Apollo uses **fixed-window rate limiting**. Exact numbers vary by plan and endpoint and
**are authoritative only from `GET /v1/usage_stats`** — Apollo may change them.

Representative 2025 limits (from Apollo's developer docs and plan comparisons):

| Plan | Per-minute / per-hour / per-day limits (illustrative — always verify) |
|------|------------------------------------------------------------------------|
| **Free** | Very limited (e.g., no API access on some endpoints, enrichment severely capped). |
| **Basic** | ~50 req/min, ~200 req/hour, ~1,000 req/day per endpoint (varies). |
| **Professional** | ~100 req/min, ~500 req/hour, ~5,000 req/day. |
| **Organization / Custom** | Custom; can be negotiated up to hundreds of thousands of enriches per day. |

Each **credit-consuming** endpoint draws from a separate **credit pool** (email credit,
phone credit, export credit) tied to the plan seat. The rate limit and the credit pool
are independent constraints.

**Client implications:**
- On every tenant connection, call `GET /v1/usage_stats` to discover current
  per-endpoint rate limits and credit balance.
- Implement token-bucket queuing client-side; 429 responses include `Retry-After`.
- Separate queues per endpoint class (enrichment vs. search vs. activity) because
  limits are per-endpoint.

**Sources**
- https://docs.apollo.io/reference/rate-limits
- https://docs.apollo.io/reference/view-api-usage-stats
- https://docs.apollo.io/docs/api-pricing
- https://www.apollo.io/pricing
- https://salesmotion.io/blog/apollo-pricing (2026-04)
- https://fullenrich.com/content/apollo-pricing (2025-11)

---

### 2.4 Webhooks

Apollo **does not publish a fully generic CRM-style webhook system**. Instead:

- **Phone-number reveal callback:** The `reveal_phone_number=true` variant of People
  Enrichment requires a `webhook_url` parameter — Apollo delivers phone numbers to
  that URL asynchronously (documented directly on the People Enrichment endpoint).
- **Waterfall enrichment callback:** Similar async result delivery pattern for
  `run_waterfall_email=true` / `run_waterfall_phone=true`.
- **Third-party event bridging:** Apollo's product-side integrations (Zapier, n8n,
  Workato, Pipedream, Integrately) expose "new reply", "new meeting booked", "new
  sequence event" webhooks, but these are surfaced through the integration partner,
  not directly from Apollo's public API.
- **Native Apollo → Salesforce sync:** Apollo has a built-in Salesforce connector that
  pushes contacts/accounts, but this is not a generic webhook for our app to subscribe
  to.

**Recommendation:**
- Treat Apollo as **pull-based** for engagement data: poll `/v1/emailer_messages` and
  `/v1/activities` on a short cadence (e.g., every 2–5 min for active sequences).
- For phone reveals, stand up a small webhook receiver per tenant (or per environment)
  and pass its URL into the `reveal_phone_number` calls.
- Consider a Zapier / Pipedream bridge in admin UI for customers who want push-based
  reply notifications without us building a polling SLA.

**Sources**
- https://docs.apollo.io/reference/people-enrichment (see `webhook_url` param)
- https://pipedream.com/apps/http/integrations/apollo-io
- https://integrately.com/integrations/apollo/webhook-api
- https://knowledge.apollo.io/hc/en-us/articles/4409237165837-Sequences-Overview

---

### 2.5 Node.js Usage Patterns

Apollo does not ship an official Node SDK, so we use plain `fetch` or `axios`:

```ts
// packages/server/src/integrations/apollo/client.ts
import { z } from 'zod';

const BASE = 'https://api.apollo.io/api/v1';

export class ApolloClient {
  constructor(private readonly apiKey: string) {}

  private async call<T>(
    path: string,
    init: RequestInit = {},
    schema: z.ZodType<T>,
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Api-Key': this.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429) {
      // honor Retry-After; queue & retry
      throw new RateLimitError(res.headers.get('Retry-After'));
    }
    if (!res.ok) throw new ApolloError(res.status, await res.text());
    return schema.parse(await res.json());
  }

  enrichPerson(input: EnrichPersonInput) {
    return this.call('/people/match', {
      method: 'POST',
      body: JSON.stringify(input),
    }, PersonEnrichmentSchema);
  }
}
```

**Patterns to use:**
- **Zod schemas per endpoint** — the enrichment response is large and nested;
  validate at the boundary.
- **Per-tenant client factory** keyed by tenant id → API key.
- **Token-bucket limiter** per endpoint class (e.g., `enrichment`, `search`,
  `activity`).
- **Retry with exponential backoff** on 429 / 5xx; respect `Retry-After`.
- **Idempotency cache** on domain / email inputs — an enrichment for
  `tim@apollo.io` today doesn't need repeating for 30 days (configurable per tenant).
- **Credit metering** — wrap each call with `creditCost` + write to a usage ledger
  table so we can bill / throttle by tenant.

The same patterns apply for server-side OAuth partner flow once we move beyond API keys.

**Sources**
- https://docs.apollo.io/docs/test-api-key
- https://docs.apollo.io/reference/authentication
- https://docs.apollo.io/reference/people-enrichment (example cURL + Node snippets)

---

### 2.6 Data Sync Strategies — Bulk Enrich vs. On-Demand

| Strategy | When | Trade-offs |
|----------|------|------------|
| **On-demand enrichment** | User opens a specific Opportunity / Account; we hit Apollo in real time to show fresh data. | Fast UX, low credit waste, but blocks UI on external API. Cache results 24–30 days. |
| **Bulk enrichment on CRM sync** | Every new Salesforce Opportunity triggers Account + primary Contact enrichment in background. | Predictable pipeline feature coverage; can burn credits on never-viewed deals. |
| **Nightly batch enrichment of "stale" records** | Re-enrich anything older than N days to catch job changes / funding rounds. | Best for forecasting freshness; schedule via queue. Use **bulk** endpoints (up to 10 per call) to save HTTP overhead. |
| **Webhook-driven enrichment** | Not natively available — emulated via scheduled poll. | — |

**Recommendation:**
1. On tenant connect, run a one-shot backfill: pull all SF Accounts with open
   Opportunities → bulk-enrich via `organizations/bulk_enrich` (10/req), then
   enrich the top N contacts per account via `people/bulk_match`.
2. Nightly job: re-enrich records whose `last_apollo_sync_at < now - 30d`.
3. Real-time: when a user expands an Opportunity, if any linked Account/Contact has
   `last_apollo_sync_at < now - 7d`, queue an on-demand enrichment but serve the
   cached record immediately so UX doesn't block.
4. Track credit spend per tenant per day; alert at 70% / throttle at 95%.

**Sources**
- https://docs.apollo.io/reference/bulk-people-enrichment
- https://docs.apollo.io/reference/bulk-organization-enrichment
- https://knowledge.apollo.io/hc/en-us/articles/33699917233293-Enrichment-Overview (2026-03)

---

### 2.7 Sandbox / Trial Availability

- Apollo offers a **14-day free trial** of paid tiers with ~1,200 credits, which
  includes limited API usage.
- Free plan users can create API keys, but most enrichment endpoints are disabled or
  heavily credit-limited.
- **There is no dedicated "sandbox" environment** — testing hits production data using
  a trial account and small credit pool.
- Mitigation for our dev loop: **mock-first integration layer** (this project's plan),
  with fixture responses that mirror Apollo schemas verbatim so real keys slot in
  cleanly.

**Sources**
- https://knowledge.apollo.io/hc/en-us/articles/5288168088205-Access-a-Free-Trial-of-Apollo (2026-02)
- https://www.apollo.io/pricing
- https://docs.apollo.io/docs/test-api-key

---

## 3. Consolidated Integration Architecture Notes

### 3.1 Layered client design

```
packages/server/src/integrations/
  salesforce/
    auth/              # OAuth (Web Server + JWT); tenant-scoped token store
    rest.ts            # wraps jsforce for REST + SOQL
    bulk.ts            # Bulk API 2.0 jobs, CSV upload/download
    composite.ts       # multi-step writes
    describe.ts        # schema discovery + custom field catalog
    pubsub/            # gRPC + Avro subscriber for CDC + Platform Events
    mappers/           # SF object -> internal forecasting model
    fixtures/          # mock data that exactly matches Apollo schemas
    mock.ts            # mock implementation of the same interface
    index.ts           # `createSalesforceClient({ mode: 'mock' | 'live' })`
  apollo/
    client.ts          # fetch-based REST client w/ Zod
    limiter.ts         # token bucket per endpoint
    fixtures/
    mock.ts
    index.ts
```

### 3.2 Interface contract

Every external module exports a **typed interface** (e.g., `SalesforceClient`,
`ApolloClient`) that both mock and live implementations satisfy. The forecasting
service depends only on these interfaces, never on `jsforce` or `fetch` directly.

```ts
export interface SalesforceClient {
  queryOpportunities(since: Date, page?: string): Promise<Page<Opportunity>>;
  queryOpportunityHistory(since: Date): AsyncIterable<OpportunityHistory>;
  describeObject(name: string): Promise<SObjectDescribe>;
  subscribe(channel: CdcChannel, handler: (ev: CdcEvent) => void): Unsubscribe;
}
```

### 3.3 Tenant-scoped token storage

| Field | Salesforce | Apollo |
|-------|------------|--------|
| Tenant id | PK | PK |
| Connection state | `connected | pending | errored` | same |
| Credentials | `access_token` (short-lived) + `refresh_token` (encrypted) + `instance_url` + `org_id` (or) JWT private key + `client_id` | encrypted `api_key` (or) OAuth tokens |
| Metadata | `api_version`, last describe sync, daily API usage snapshot | plan tier, credit balance |
| Health | last success, last error code | same |

### 3.4 Observability

- Per-call metrics: `integration.call_total{provider,endpoint,tenant_id,status}`.
- Remaining quotas: `integration.quota_remaining{provider,tenant_id}` scraped from
  SF `Sforce-Limit-Info` header and Apollo `/usage_stats`.
- Alert on:
  - Token refresh failures (SF).
  - CDC replay gaps (SF).
  - Credit exhaustion (Apollo).
  - 5xx rate exceeding threshold.

### 3.5 Security

- All provider secrets at rest are encrypted with envelope encryption (KMS / libsodium).
- No provider secret ever reaches the browser; all calls server-side.
- PII (emails, phone numbers) from Apollo enrichment classified as sensitive; audit-log
  every read.

---

## 4. Glossary

| Term | Definition |
|------|------------|
| **CDC** | Change Data Capture — Salesforce feature that emits an event for every CRUD on subscribed objects. |
| **Connected App** | Salesforce configuration representing an external integration; holds OAuth settings. |
| **Forecast Category** | Bucket an Opportunity rolls into (Pipeline, Best Case, Commit, Closed). |
| **Governor limit** | Per-transaction resource limit inside Salesforce (CPU, heap, SOQL rows). Our external app mostly cares about API / Bulk limits. |
| **Pub/Sub API** | Modern gRPC-based streaming interface for events, replacing legacy Streaming API. |
| **Scratch Org** | Short-lived, disposable Salesforce org used for development & CI. |
| **SOQL** | Salesforce Object Query Language. |
| **Waterfall enrichment (Apollo)** | Apollo chains multiple data providers to attempt enrichment; results returned async via webhook. |

---

## 5. Primary Sources (full list)

**Salesforce**
- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_jwt_flow.htm
- https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm
- https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/
- https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/ (Bulk API 2.0)
- https://developer.salesforce.com/docs/platform/pub-sub-api/overview
- https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunity.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunitylineitem.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingitem.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingtype.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingquota.htm
- https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm
- https://developer.salesforce.com/blogs/2024/11/api-limits-and-monitoring-your-api-usage
- https://developer.salesforce.com/blogs/2022/12/processing-large-amounts-of-data-part-2
- https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf (Pipeline Forecasting Implementation Guide Spring '26)
- https://www.npmjs.com/package/jsforce
- https://www.npmjs.com/package/@jsforce/jsforce-node
- https://github.com/jsforce/jsforce
- https://www.salesforceben.com/salesforce-scratch-orgs/ (2026-01-26)
- https://sfdcprep.com/salesforce-api-rest-soap-bulk-composite-graphql-guide/ (2025-10-23)
- https://sfdcprep.com/salesforce-platform-events-vs-change-data-capture-use-cases/ (2026-01-24)
- https://sfdcprep.com/salesforce-webhooks-platform-events-callouts/ (2025-11-26)
- https://sfdcdevelopers.com/2025/09/24/what-different-oauth2-0-authorization-flows/
- https://sfdcdevelopers.com/2026/01/13/salesforce-jwt-flow-guide/
- https://coefficient.io/salesforce-api/salesforce-api-rate-limits (2025-08)
- https://forcenaut.com/blog/salesforce-api-limits-guide/ (2026-02-25)
- https://ascendix.com/blog/salesforce-opportunity-stages/ (2025-03-28)

**Apollo.io**
- https://docs.apollo.io/
- https://docs.apollo.io/docs/api-overview
- https://docs.apollo.io/reference/authentication
- https://docs.apollo.io/docs/create-api-key
- https://docs.apollo.io/reference/rate-limits
- https://docs.apollo.io/reference/view-api-usage-stats
- https://docs.apollo.io/docs/api-pricing
- https://docs.apollo.io/reference/people-enrichment
- https://docs.apollo.io/reference/bulk-people-enrichment
- https://docs.apollo.io/reference/organization-enrichment
- https://docs.apollo.io/reference/bulk-organization-enrichment
- https://docs.apollo.io/reference/people-api-search
- https://docs.apollo.io/docs/use-oauth-20-authorization-flow-to-access-apollo-user-information-partners
- https://knowledge.apollo.io/hc/en-us/articles/4409237165837-Sequences-Overview (2026-04)
- https://knowledge.apollo.io/hc/en-us/articles/33699917233293-Enrichment-Overview (2026-03)
- https://knowledge.apollo.io/hc/en-us/articles/4416173158541-Use-Apollo-API (2025-12)
- https://knowledge.apollo.io/hc/en-us/articles/5288168088205-Access-a-Free-Trial-of-Apollo (2026-02)
- https://www.apollo.io/pricing
- https://salesmotion.io/blog/apollo-pricing (2026-04-02)
- https://fullenrich.com/content/apollo-pricing (2025-11)
- https://generect.com/blog/apollo-enrichment-api/ (2026-01-25)
