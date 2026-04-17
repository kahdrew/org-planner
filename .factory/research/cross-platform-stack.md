# Cross-Platform Stack Research: Web + iOS + Android for a Sales Forecasting SaaS

**Prepared:** 2026-04-16
**Project context:** Sales forecasting SaaS, MongoDB backend, end-to-end TypeScript, small-to-mid team, not shipping to public app stores.
**Goal:** Pick an opinionated, modern stack that maximizes code sharing across web + native while handling data-heavy dashboards, charts, complex forms, multi-tenancy, and intermittent connectivity for field reps.

---

## Executive Recommendation (at a glance)

| Layer | Pick |
|---|---|
| App framework (native + web) | **Expo SDK 53+ with Expo Router v5** using React Native 0.79+ and **React Native Web** |
| Web host | **Next.js 15 (App Router)** for SEO pages + server routes; **Expo Router Web** for the app shell |
| Monorepo | **pnpm workspaces + Turborepo** (+ Changesets if publishing internal pkgs) |
| Shared styling | **NativeWind v4** for app UI; optionally **Tamagui** if you want one codebase driving web+native from the same component tree |
| Navigation | **Expo Router v5** (file-based, supports web). Use **Solito** helpers only if you keep Next.js and Expo as two separate apps sharing a `packages/app` |
| Charts | **Victory Native XL** (Skia-backed, works on web via Victory) for interactive cross-platform charts; drop to **React Native Skia** + custom drawing if performance demands it |
| Lists / tables on mobile | **FlashList v2** (virtualized) + collapsible card layouts, horizontal scroll for wide forecast rows |
| Data layer | **TanStack Query v5** + **Zustand** for UI state; **TanStack DB 0.6** (SQLite-backed) or **MMKV** for persistence |
| Real-time | **Socket.IO** (or native `WebSocket`) feeding `queryClient.setQueryData`; **SSE** as a fallback on web |
| Auth | Custom JWT issued by API → **`expo-secure-store`** on native, **httpOnly cookies** on web. **Better Auth** or **Clerk** if you want a managed provider |
| Tests | Vitest + Testing Library (web), Jest + RNTL (native), Playwright + Detox for shared E2E via Page Object Model |
| CI/CD | **Vercel** for web, **EAS Workflows** (or GitHub Actions + `eas build --local`) for iOS/Android binaries — ad-hoc/internal distribution only |
| Backend framework | **Fastify** with TypeBox/Zod; acceptable alternative **Hono** if you might target Cloudflare Workers. Avoid NestJS unless team is already Angular-fluent |
| MongoDB access | **Mongoose 8+** (`InferSchemaType` / `HydratedDocument`) — **not Prisma**, which lacks embedded-document support |
| Time-series data | Native **MongoDB time-series collections** (meta+time+granularity) for forecast snapshots + KPI rollups |

The rest of this document is the reasoning, the trade-offs, and the sources.

---

## 1. Architecture options for web + mobile consistency

### 1.1 Expo + React Native Web (baseline)
Expo is the de-facto framework for cross-platform React Native apps in 2026. Expo SDK 53/54 ships with React Native 0.79+, the New Architecture (Fabric + TurboModules) enabled by default, and first-class web via `react-native-web`. ([Expo docs](https://expo.dev/), [Pagepro](https://pagepro.co/blog/what-is-expo-js/))

Trade-offs:
- Pro: one component tree (`<View>`, `<Pressable>`, `<Text>`) that renders native on iOS/Android and DOM on web.
- Con: React Native Web is good for app-shell UI but *not* ideal for public marketing/SEO pages — it produces React Native's own primitives (no semantic `<h1>`, `<button>`), which hurts SEO and Lighthouse scores. Use Next.js for any public pages.

### 1.2 Styling — Tamagui vs NativeWind (vs Unistyles/twrnc)
PkgPulse's 2026 roundup summarizes the landscape: NativeWind compiles Tailwind classes at build time to RN `StyleSheet` objects; Tamagui goes further with a Babel plugin that extracts static styles at compile time and ships a universal component library that targets both RN and Next.js. ([PkgPulse 2026](https://www.pkgpulse.com/blog/nativewind-vs-tamagui-vs-twrnc-react-native-styling-2026))

| | NativeWind v4 | Tamagui | twrnc |
|---|---|---|---|
| Universal (web+native same tree) | Limited | **Yes** | No |
| Build-time compile | Yes (Metro transformer) | Yes (Babel plugin) | No (runtime) |
| Component library bundled | No | 80+ | No |
| Setup complexity | Medium | High | Very low |
| Ideal for dashboards | ✅ | ✅ (with built-in components) | ❌ (runtime cost) |

**Recommendation for a forecasting dashboard:** Start with **NativeWind** because (a) your team will already know Tailwind from the web, (b) it compiles away the runtime cost, and (c) it works in Expo without babel plugin surprises. Consider **Tamagui** only if you want a unified design system with primitives like `Sheet`, `Dialog`, `Select` that look identical on web + native — Tamagui is the architecturally cleanest way to achieve that.

### 1.3 Navigation — Expo Router vs Solito vs React Navigation
- **React Navigation v7** — still the pure-native pick, but you wire routes yourself and web support is second-class.
- **Expo Router v5** — file-based routing (Next.js-style) on top of React Navigation. Targets iOS, Android, and web; includes built-in **protected routes** for auth, API routes (server functions), and deep linking. ([Expo Router protected routes](https://docs.expo.dev/router/advanced/protected), [PkgPulse 2026 review](https://www.pkgpulse.com/blog/expo-router-vs-react-navigation-vs-solito-react-native-navigation-2026))
- **Solito** — thin wrapper that unifies `next/router` (Next.js) and React Navigation (Expo). In practice it's the glue when you keep **two apps** (Next.js for web, Expo for native) sharing a `packages/app` of features. Solito 5 is "web-first" but still works. ([Solito site](https://solito.dev/), [Solito 5 announcement](https://dev.to/redbar0n/solito-5-is-now-web-first-but-still-unifies-nextjs-and-react-native))

For a forecasting SaaS with data-heavy dashboards and complex forms:
- If 100% of the product is authenticated app UI (no marketing site), **Expo Router v5 with web output** is the simplest — one app, one router, native + web.
- If you also want marketing/SEO pages, add a **Next.js app** next to the Expo app and use **Solito** for shared route helpers in the app package. That's the Tamagui team's recommended setup.

### 1.4 Trade-offs for data-heavy dashboards, charts, complex forms
- **Dashboards:** Tamagui's theme tokens + RN Reanimated 3 give you the smoothest cross-platform transitions. NativeWind is equally capable when paired with **react-native-reanimated** and **moti**.
- **Charts:** see §3.
- **Forms:** Use **React Hook Form** + **Zod** resolvers (works identically web/native). For cross-platform form primitives, Tamagui's `Input`, `Select`, `Sheet` saves you from re-implementing. Otherwise, build a small abstraction over native `TextInput` and web `<input>` in your `packages/ui`.

---

## 2. Monorepo tooling

The 2026 consensus ([viadreams 2026](https://viadreams.cc/en/blog/monorepo-tools-2026/), [daily.dev 2026](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-tools), [Encore 2026](https://encore.dev/articles/best-typescript-backend-frameworks)):

| | Turborepo | Nx | pnpm workspaces alone |
|---|---|---|---|
| Setup | Low | Medium | Very low |
| Task caching | Built-in + remote | Built-in + Nx Cloud | None |
| Code generators | No | Yes | No |
| JS/TS focus | Yes | Polyglot | Any |
| Best for | Modern JS monorepos | Large enterprise polyrepos | Small JS projects |

**Recommended layout (pnpm + Turborepo):**
```
org-planner/
├─ apps/
│  ├─ native/           # Expo (iOS/Android/web)
│  ├─ web/              # Next.js 15 (marketing + SEO + /app that hosts Expo web if needed)
│  └─ api/              # Fastify server
├─ packages/
│  ├─ app/              # Shared screens, navigation hooks, features (Solito-style)
│  ├─ ui/               # Shared component library (NativeWind or Tamagui)
│  ├─ types/            # Shared domain types (zod schemas)
│  ├─ api-client/       # Typed fetch client (shared)
│  ├─ charts/           # Chart primitives
│  └─ config/           # tsconfig, eslint, prettier shared
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

**Shared-type strategy:**
1. Define Zod schemas in `packages/types`.
2. Server validates inbound payloads with those schemas.
3. Server returns typed responses (Fastify type-provider or Hono's `hc` client).
4. `packages/api-client` exposes typed calls consumed by both `apps/native` and `apps/web` — same TypeScript types from request to DB.

**Shared utilities strategy:** keep dependencies explicit in each package's `package.json` (no hoisting surprises), reference internal workspaces with `"workspace:*"`, and use **Changesets** for versioning if anything needs to ship to npm.

Use **Turborepo Remote Cache** (free tier from Vercel) — CI builds and developer laptops share a cache keyed on file+env hashes, dropping cold builds from minutes to seconds. ([viadreams 2026](https://viadreams.cc/en/blog/monorepo-tools-2026/))

---

## 3. Charts & dashboards across web + native

Based on the [Nerdify chart guide 2026](https://getnerdify.com/blog/charts-react-native/), the [PkgPulse 2026 comparison](https://www.pkgpulse.com/blog/victory-native-vs-react-native-chart-kit-vs-echarts-2026), and the [Victory Native XL repo](https://github.com/FormidableLabs/victory-native-xl):

| Library | Engine | Native | Web | Interactivity | Best for |
|---|---|---|---|---|---|
| **Recharts** | SVG (React) | ❌ | ✅ | ✅ | Pure web dashboards |
| **Victory Native XL** | Skia + SVG | ✅ | ✅ (via Victory / React) | ✅ | Cross-platform, composable, theme-able |
| **React Native Skia** | GPU/Skia | ✅ | ⚠ experimental web | ✅ (manual) | Real-time, 10k+ points, fintech |
| **react-native-gifted-charts** | SVG | ✅ | ⚠ weak | Limited | Quick native dashboards |
| **Apache ECharts** (via `react-native-echarts`) | Canvas/Skia | ✅ | ✅ | ✅ | Feature-rich but heavier |

**Recommendation for interactive dashboards (filters, drill-down, saved views):**
- Use **Victory (web)** + **Victory Native XL (native)** with the same data/options shape. Victory Native XL added a Skia backend so performance on native is good up to ~5k points, and the composable component model (`VictoryChart`, `VictoryBar`, `VictoryAxis`) lets you build drill-down and zoom without fighting the library. ([FormidableLabs/victory-native-xl](https://github.com/FormidableLabs/victory-native-xl))
- For any single chart that must render >10k live points (e.g., pipeline trend over every opportunity-touch), drop that one chart to **React Native Skia** on native and keep **Recharts** (or `react-native-skia/web`) on web. Wrap both in a common `<ForecastTrendChart>` component with shared props so higher-level code doesn't care.
- Put all of this in `packages/charts` with a platform-split file (`ForecastTrendChart.tsx` for web/RN-Web, `ForecastTrendChart.native.tsx` for native) so the rest of the app imports one path.

---

## 4. Data grids / tabular forecast data on mobile

Pipeline tables (rep × stage × $ × close date × probability × weighted amount …) don't fit a phone. Proven patterns:

1. **Card list with FlashList v2.** FlashList v2 (Shopify, 2025 rewrite) eliminates the size-estimate requirement, integrates with the New Architecture, and handles long opportunity lists at 60fps. Each "row" becomes a card with the 3–5 most important fields prominent; tap to drill into the full record. ([Shopify engineering — FlashList v2](https://shopify.engineering/flashlist-v2))
2. **Horizontal scroll with sticky first column.** For the "must-have" Excel-like view: a `ScrollView` wrapping a `FlashList`, with column 1 (opportunity name) pinned. Reuse the same column definitions between your web `@tanstack/react-table` grid and the mobile horizontal table by hoisting them into `packages/types`.
3. **Progressive disclosure.** Show a summarized roll-up row (count, total $, weighted $) at the top of each segment, collapse-to-open the rows beneath. Works well on both platforms.
4. **Filters as bottom sheets** (use Tamagui `Sheet` or `@gorhom/bottom-sheet`) rather than sidebar filters like on web.
5. **Edit in a detail view, not in-grid.** Field-rep UX typically doesn't need in-place cell editing on a phone.

For web you can keep a full data grid via **TanStack Table v8** (+ optional AG Grid when the enterprise features matter). Define the column/row data shapes once; TanStack Table works on web, and a custom RN adapter can consume the same definitions.

---

## 5. Real-time / live data

Same pattern works across web and native:

1. Use TanStack Query as the source of truth for server state on both platforms. ([TanStack Query — React Native](https://tanstack.com/query/latest/docs/framework/react/react-native))
2. On mount, open a **WebSocket** (`socket.io-client` or native `WebSocket`) with JWT in the connect handshake.
3. On every server event, call `queryClient.setQueryData(['forecast', tenantId, period], updater)` to mutate the relevant cache entry — components re-render automatically.
4. Use `invalidateQueries` when the event type is coarse ("forecast changed"), or `setQueryData` when the event carries the specific delta.
5. Fall back to **Server-Sent Events (SSE)** on web for one-way streams (KPI tickers, forecast recompute progress). SSE is trivially proxied through Vercel and has automatic reconnects. ([dev.to — SSE vs WebSockets vs polling](https://dev.to/itaybenami/sse-websockets-or-polling-build-a-real-time-stock-app-with-react))
6. Expose a small `useLiveQuery(queryKey, eventName)` hook in `packages/api-client` so screens don't manage sockets themselves.

Rule of thumb: WebSocket when the client must push too (saved-view collaboration, chat-style comments); SSE when the server is the only talker (dashboard refresh, forecast recalc progress); polling as graceful degrade.

---

## 6. Offline / optimistic updates (critical for field sales reps)

Field reps need: read cached opportunities offline, create/update notes offline, optimistic UI, and reliable background sync.

Three-layer recipe:
- **Write-path**: `useMutation` with `onMutate` → `queryClient.setQueryData` for instant UI; `onError` rolls back; `onSettled` invalidates. Standard TanStack Query optimistic updates pattern. ([TanStack Query optimistic updates](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates))
- **Cache persistence**: use `persistQueryClient` with `@tanstack/query-async-storage-persister` or `query-sync-storage-persister`. For mobile, back it with **MMKV** (fastest K/V store — see [StorageBenchmark](https://github.com/mrousavy/StorageBenchmark)) via `react-native-mmkv`. For web, use IndexedDB (via `idb-keyval`). See [the official Offline example](https://tanstack.com/query/v4/docs/framework/react/examples/offline).
- **Complex offline domain models**: if opportunities, accounts, activities each need CRUD offline with foreign keys, move up to **TanStack DB 0.6** (SQLite-backed persistence, live queries, reactive effects — March 2026) or **WatermelonDB** (proven, Realm-like, LazyLoading). TanStack DB is the newer bet that sits naturally with TanStack Query; WatermelonDB is safer for large record counts (>10k). ([TanStack DB 0.6](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes), [LogRocket TanStack DB UX](https://blog.logrocket.com/tanstack-db-ux/))

UI-state (filters, saved views, theme, toggles) belongs in **Zustand** — it's tiny, hook-based, and platform-agnostic.

For the "critical field-rep offline" case:
1. Pre-fetch the rep's owned opportunities + accounts when they open the app online.
2. Persist to MMKV/SQLite.
3. Queue writes in a local outbox; flush when `NetInfo.isInternetReachable` flips true.
4. Use conflict-resolution "last-write-wins with server clock" unless the product has genuine multi-user conflicts — then move to CRDT-style merge (Yjs/Automerge, heavier).

---

## 7. Authentication across platforms

Same API issues the same JWT; the **storage** differs per platform. ([Expo docs — Authentication](https://docs.expo.dev/develop/authentication/))

- **Native (iOS/Android):** store access token in **`expo-secure-store`** (Keychain / Keystore). Refresh token likewise. **Never** AsyncStorage for tokens.
- **Web:** set the token as an **httpOnly, Secure, SameSite=Strict cookie** from the API on login. The JS bundle never touches the token → XSS can't exfiltrate. All subsequent requests include it automatically.
- **Same API, same JWT schema.** The server's auth middleware reads the token from either `Authorization: Bearer …` (native) or the httpOnly cookie (web) — whichever is present. This lets one backend serve both transports with one middleware.

**OAuth (Google / Microsoft / Okta SSO for enterprise sales teams):** use **`expo-auth-session`** for the OAuth dance on native and a normal OAuth redirect on web. Exchange the provider's ID token on your API for your own JWT so you have one canonical identity.

**If you want to skip the auth server:** use **Better Auth**, **Clerk**, or **Supabase Auth** — all four have first-class Expo modules. Clerk is the most polished for enterprise SSO; Better Auth is the modern open-source pick. ([Expo docs — Auth solutions](https://docs.expo.dev/develop/authentication/#auth-solutions))

**Token lifetime:** 10–15 min access token, 7–30 day refresh token in secure storage / httpOnly cookie. Rotate refresh tokens on use.

**Tenant isolation:** embed `tenantId` + `role` claims in the JWT. Every API route enforces "user can only see their tenant" at the DB layer (see §10).

---

## 8. Testing strategy

| Layer | Web | Native | Shared |
|---|---|---|---|
| Unit (pure functions) | Vitest | Jest (vitest works with config work) | **Tests live in the package of the code** (`packages/types/__tests__`) so both platforms run them |
| Component | @testing-library/react + Vitest | @testing-library/react-native + Jest | Hooks that live in `packages/app` tested with RTL (native flavor) |
| Integration (API) | Vitest + `supertest` | — | On the backend |
| E2E | **Playwright** | **Detox** | **Page Object Model** — shared `e2e/screens.ts` interfaces with Playwright and Detox implementations. See the Ignite Cookbook recipe for the exact pattern. ([Universal E2E Testing](https://ignitecookbook.com/docs/recipes/UniversalE2ETesting/)) |

- **Vitest vs Jest:** Vitest is ~5× faster on web and what most new projects pick in 2026 ([Vitest vs Jest 2026](https://tech-insider.org/vitest-vs-jest-2026/), [DevToolReviews 2026](https://www.devtoolreviews.com/reviews/vitest-vs-jest-vs-playwright-2026-comparison)). On native you'll still need Jest because RN tooling assumes it, but you can run Vitest for all pure-logic packages.
- **Shared business logic (pricing, forecast math, date helpers):** put it in `packages/domain`, test it with Vitest only (fastest dev loop), and both apps pick up the same tested code. Don't duplicate tests per platform.
- **Agent-browser / MCP browser automation:** useful for web-only smoke tests on the deployed preview, but Playwright gives you deterministic control for CI. Use agent-browser for exploratory QA, not for regressions.

---

## 9. CI/CD setup

Even though you won't ship to the App Store / Play Store, you *should* produce installable builds (ad-hoc iOS via TestFlight internal tracks, APK for Android, internal distribution) because it's the only realistic way to dogfood the native experience.

**Recommended pipeline:**
1. **Vercel** connected to `apps/web`. Previews on every PR, production on merge to `main`. Free tier is enough early on.
2. **EAS Workflows** (Expo's CI, announced August 2025) or **GitHub Actions + `eas build`** for `apps/native`.
   - Free tier: 30 builds/month (15 iOS). Enough for dogfooding. ([Expo EAS pricing](https://expo.dev/pricing))
   - On merge to `main`: build iOS (`internal` distribution) and Android (`internal`) with `eas build --platform all`, publish OTA JS via `eas update` to a `production` channel.
   - Ad-hoc distribution: iOS over TestFlight internal testers; Android via a signed APK served from a gated URL or Firebase App Distribution.
3. **Backend (`apps/api`):** Docker image, deploy to Fly.io / Railway / Render / Vercel Fns (if Hono). Run DB migrations as a pre-deploy step.
4. **Turborepo remote cache** shared between Vercel, EAS, and GH Actions — dramatic build time reduction.

GitHub Actions snippet pattern:
```yaml
- uses: expo/expo-github-action@v8
  with: { eas-version: latest, token: ${{ secrets.EXPO_TOKEN }} }
- run: pnpm install --frozen-lockfile
- run: pnpm turbo run build --filter=...[origin/main]
- run: eas build --platform all --profile internal --non-interactive
```
([Expo — integrating EAS Workflows with GitHub Actions](https://expo.dev/blog/how-to-integrate-eas-workflows-with-github-actions), [procedure.tech — Automate Mobile Builds](https://procedure.tech/blogs/automate-mobile-app-builds-with-expo-eas-%28no-ci-server-required%29))

Having binaries buildable (even if not shipped) is worth the two days of setup.

---

## 10. MongoDB backend — schema, tooling, patterns

### 10.1 ODM / driver choice — Mongoose vs MongoDB driver vs Prisma
([PkgPulse — Mongoose vs Prisma 2026](https://www.pkgpulse.com/blog/mongoose-vs-prisma-2026))

- **Prisma + MongoDB: rejected.** Prisma's MongoDB connector does **not** support embedded documents — the core MongoDB modeling pattern. For a forecasting schema with embedded snapshots, commentary arrays, and denormalized account/rep data, this is a dealbreaker.
- **Native MongoDB driver only:** pure TypeScript, max flexibility, but you re-invent validation, hooks, and population.
- **Mongoose 8+: recommended.** Supports embedded docs, aggregation pipelines (critical for KPI rollups and `$lookup` joins), mature middleware, and its TypeScript story improved significantly with `InferSchemaType` and `HydratedDocument`. Use `.lean()` on read-heavy paths to skip the Mongoose document overhead.

### 10.2 Multi-tenant strategy
Three canonical approaches ([MongoDB Atlas — Build a Multi-Tenant Architecture](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/), [Medium — MongoDB multi-tenancy](https://medium.com/mongodb/multi-tenancy-and-mongodb-5658512ed398)):
1. **Database-per-tenant** — strongest isolation, but Atlas caps DBs per cluster and it complicates migrations.
2. **Collection-per-tenant** — awkward at scale.
3. **Shared collections with a `tenantId` discriminator field + compound indexes** — recommended for SaaS with dozens to thousands of tenants. Every index leads with `tenantId`, every query filters by `tenantId`, and the app layer wraps queries in a `withTenant()` helper to prevent accidental cross-tenant reads.

**Row-level enforcement:** put the tenant check in a single `TenantModel` wrapper over Mongoose models so every query implicitly scopes by the caller's `tenantId`. This is the critical correctness boundary.

### 10.3 Forecast time-series data
Use MongoDB **Time Series Collections** for forecast snapshots (created in `createCollection` with `timeseries: { timeField, metaField, granularity }`). ([MongoDB — Time Series best practices](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-best-practices/))

Example:
```ts
await db.createCollection('forecast_snapshots', {
  timeseries: {
    timeField: 'snapshotAt',
    metaField: 'meta',          // { tenantId, repId, segment, period }
    granularity: 'hours',
  },
  expireAfterSeconds: 60 * 60 * 24 * 365 * 3, // 3-year retention
});
```

Each snapshot row:
```ts
{
  snapshotAt: ISODate,
  meta: { tenantId, repId, segment, period: '2026-Q2' },
  bestCase: 1_200_000,
  commit: 900_000,
  weightedPipeline: 2_400_000,
  closedWon: 450_000,
  opportunityIds: [/* … */],
}
```

Keep live forecasts in a regular collection; persist an immutable snapshot to the time-series collection every time the forecast is computed (hourly cron + on-demand "save view"). You get:
- Automatic bucketing / compression (2–3× storage savings vs regular collections).
- Efficient range queries for "forecast vs time" trend charts.
- Built-in `$granularity`-aware aggregations.

### 10.4 KPI aggregation pipelines
Aggregation pipeline is where Mongoose earns its keep. Typical forecast-KPI pipeline:
```ts
const pipeline = [
  { $match: { 'meta.tenantId': tenantId, 'meta.period': period } },
  { $sort: { snapshotAt: -1 } },
  { $group: {
      _id: '$meta.repId',
      latest: { $first: '$$ROOT' },
      history: { $push: { t: '$snapshotAt', weighted: '$weightedPipeline' } },
  }},
  { $lookup: {
      from: 'users',
      localField: '_id',
      foreignField: '_id',
      as: 'rep',
  }},
  { $project: { _id: 0, rep: { $first: '$rep' }, latest: 1, history: { $slice: ['$history', 30] } } },
];
```
Expose this via a typed `forecastController.getForecastByRep(...)` using Mongoose's `.aggregate<T>()` with an explicit return type. Pre-compute heavy aggregations on a schedule and store the result in a `kpi_cache` collection to keep dashboards snappy.

### 10.5 Indexing
- `{ tenantId: 1, ownerId: 1, closeDate: 1 }` on opportunities.
- `{ tenantId: 1, stage: 1, updatedAt: -1 }` for pipeline views.
- TTL indexes on transient collections (invite tokens, OTPs).
- Compound text indexes on `{ name, accountName }` for search.
- Enable `Atlas Search` for fuzzy/relevance search if needed.

---

## 11. API framework — Express / Fastify / Hono / NestJS

([Encore — Best TypeScript Backend Frameworks in 2026](https://encore.dev/articles/best-typescript-backend-frameworks), [Better Stack 2025](https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/))

| | Express | Fastify | Hono | NestJS |
|---|---|---|---|---|
| Maturity | ✅✅✅ | ✅✅ | ✅ | ✅✅ |
| TS ergonomics | Needs Zod/Joi | Strong (JSON Schema / TypeBox) | **Excellent** | Strong (decorators) |
| Schema validation | Manual | Built-in (JSON Schema) | Built-in (Zod / TypeBox) | Built-in (class-validator) |
| Runtime flexibility | Node | Node | **Node / Bun / Deno / Cloudflare Workers** | Node |
| Bundle / cold-start | Heavy | Medium | **Tiny** | Heaviest |
| Learning curve | Low | Medium | Low | **High** |
| Performance | OK | Fast | Fastest | OK |

**Recommendation: Fastify.** Reasons:
1. Best balance of familiarity and 2026-era ergonomics for a Node.js team.
2. JSON Schema validation means you get OpenAPI docs for free via `@fastify/swagger` — your native + web clients and any 3rd-party integrator consume the same contract.
3. Plugin-based architecture (auth plugin, DB plugin, socket plugin) keeps the monolith cleanly testable.
4. First-class TypeScript support via `TypeBoxTypeProvider` or `fastify-zod` — inbound/outbound types are inferred from the schema.

**Pick Hono instead if** you expect to deploy to Cloudflare Workers or want maximum portability. Hono is the fastest-moving framework and is a great choice if the team is greenfield.

**Avoid NestJS** unless the team has Angular experience. It's over-architected for a SaaS API and the decorator stack makes debugging painful.

**Avoid Express** for a new project in 2026. You lose schema-first validation, OpenAPI generation, and modern perf — all for middleware compatibility you rarely need.

---

## Sources

- Expo — [Documentation](https://docs.expo.dev/), [Work with monorepos](https://docs.expo.dev/guides/monorepos/), [Authentication](https://docs.expo.dev/develop/authentication/), [EAS Build](https://docs.expo.dev/build/introduction/), [EAS Workflows launch](https://expo.dev/blog/expo-workflows-automate-your-release-process), [EAS + GitHub Actions](https://expo.dev/blog/how-to-integrate-eas-workflows-with-github-actions)
- Pagepro — [What Is Expo? Platform Guide 2025–2026](https://pagepro.co/blog/what-is-expo-js/)
- PkgPulse 2026 — [NativeWind vs Tamagui vs twrnc](https://www.pkgpulse.com/blog/nativewind-vs-tamagui-vs-twrnc-react-native-styling-2026), [Expo Router vs React Navigation vs Solito](https://www.pkgpulse.com/blog/expo-router-vs-react-navigation-vs-solito-react-native-navigation-2026), [Victory Native XL vs React Native Chart Kit vs ECharts](https://www.pkgpulse.com/blog/victory-native-vs-react-native-chart-kit-vs-echarts-2026), [Mongoose vs Prisma 2026](https://www.pkgpulse.com/blog/mongoose-vs-prisma-2026)
- Medium RN Journal — [NativeWind vs Tamagui vs Unistyles 2026](https://medium.com/react-native-journal/nativewind-vs-tamagui-vs-unistyles-which-styling-library-should-you-use-in-2026-a1eeda5608a4)
- Solito — [Website](https://solito.dev/), [Solito 5 announcement](https://dev.to/redbar0n/solito-5-is-now-web-first-but-still-unifies-nextjs-and-react-native), [Expo Router integration](https://solito.dev/guides/expo-router), [Expo Router vs Solito discussion](https://github.com/nandorojo/solito/discussions/428)
- Viadreams 2026 — [Monorepo Tools 2026: Turborepo vs Nx vs Lerna vs pnpm](https://viadreams.cc/en/blog/monorepo-tools-2026/)
- daily.dev 2026 — [Monorepo in 2026: Turborepo vs Nx vs Bazel](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-tools)
- Shopify engineering — [FlashList v2](https://shopify.engineering/flashlist-v2); [FlashList docs](https://shopify.github.io/flash-list/)
- Victory Native — [Victory Native XL repo](https://github.com/FormidableLabs/victory-native-xl), [React Native Skia docs](https://shopify.github.io/react-native-skia/)
- Nerdify — [Choosing The Best Charts React Native Library For 2026](https://getnerdify.com/blog/charts-react-native/)
- TanStack — [React Native Query docs](https://tanstack.com/query/latest/docs/framework/react/react-native), [Optimistic Updates guide](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates), [Offline example](https://tanstack.com/query/v4/docs/framework/react/examples/offline), [TanStack DB 0.6 release](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
- LogRocket — [TanStack Query + WebSockets](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/), [TanStack DB UX](https://blog.logrocket.com/tanstack-db-ux/)
- dev.to — [SSE vs WebSockets vs Polling — Real-Time Stock App](https://dev.to/itaybenami/sse-websockets-or-polling-build-a-real-time-stock-app-with-react), [Automate Your Expo Builds with EAS + GitHub Actions](https://dev.to/jocanola/automate-your-expo-builds-with-eas-using-github-actions)
- StorageBenchmark — [mrousavy/StorageBenchmark](https://github.com/mrousavy/StorageBenchmark)
- OneUpTime 2026 — [Offline-First React Native](https://oneuptime.com/blog/post/2026-01-15-react-native-offline-architecture/view), [TanStack Query in RN](https://oneuptime.com/blog/post/2026-01-15-react-native-tanstack-query/view)
- MongoDB — [Time Series best practices](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-best-practices/), [Time Series Data guide](https://www.mongodb.com/resources/products/capabilities/mongodb-time-series-data), [Build a Multi-Tenant Architecture on Atlas](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/), [Multi-tenancy blog](https://medium.com/mongodb/multi-tenancy-and-mongodb-5658512ed398)
- Encore 2026 — [Best TypeScript Backend Frameworks](https://encore.dev/articles/best-typescript-backend-frameworks), [Fastify Alternatives](https://encore.dev/articles/fastify-alternatives), [Hono Alternatives](https://encore.dev/articles/hono-alternatives)
- Better Stack — [Fastify vs Express vs Hono](https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/)
- Ignite Cookbook — [Universal E2E Testing with Detox and Playwright](https://ignitecookbook.com/docs/recipes/UniversalE2ETesting/)
- Testing compared — [Vitest vs Jest 2026](https://tech-insider.org/vitest-vs-jest-2026/), [Vitest vs Jest vs Playwright 2026](https://www.devtoolreviews.com/reviews/vitest-vs-jest-vs-playwright-2026-comparison), [React Native testing overview](https://reactnative.dev/docs/testing-overview)
- React Native Security — [React Native docs](https://reactnative.dev/docs/security)
- Forecastio — [SaaS Sales Forecasting methods](https://forecastio.ai/blog/saas-sales-forecasting)
- byCedric — [expo-monorepo-example](https://github.com/byCedric/expo-monorepo-example)
