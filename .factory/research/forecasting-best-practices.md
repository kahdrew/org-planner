# Sales Forecasting Best Practices — Product Behavior & Data Model Research

**Research date:** 2026-04-16
**Scope:** Product behavior & data models of Clari, Gong Forecast, BoostUp (Terret), Salesforce Collaborative Forecasts + Einstein, InsightSquared/Mediafly, Aviso, Revenue Grid, Outreach Commit, HubSpot Forecast, Pipedrive, Anaplan — to inform a production-grade SaaS forecasting app.

---

## 1. Forecast Categorization Models

### 1.1 Canonical category set (industry standard)
Virtually every platform settles on the same five-bucket taxonomy, rooted in Salesforce Collaborative Forecasting, with a sixth "Most Likely" option that sits between Best Case and Commit:

- **Pipeline** — early-stage, low confidence (< ~30%)
- **Best Case** — qualified, possible-if-everything-goes-well (~30–60%)
- **Most Likely** (optional, new in Salesforce Winter '22) — between Best Case and Commit
- **Commit** — rep stakes reputation; reps should close ~90% of these ([Clari](https://www.clari.com/blog/defining-sales-forecast-categories-to-drive-reliable-revenue/))
- **Closed** — won (and optionally lost) in the period
- **Omitted / Not Forecasted** — excluded from forecast totals

Sources: Salesforce Collaborative Forecasts Implementation Guide (Spring '26) ([PDF](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf)); Clari "Defining Sales Forecast Categories"; Forecastio "Forecast Categories Explained" (Mar 2026); HubSpot "Set up the forecast tool" ([knowledge.hubspot.com](https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool)); Revenue Grid docs; Gong help.

### 1.2 One opportunity → one category, derived from Stage
Every platform enforces **1 opp ⇔ 1 category** at any time, indirectly driven by Stage:

- Salesforce: admins configure a Stage → Forecast Category map on the `Opportunity.StageName` picklist. Stages like `Prospecting` map to **Pipeline**; `Proposal/Price Quote` to **Best Case**; `Negotiation/Review` to **Commit**; `Closed Won` to **Closed** ([Salesforce Ben, Shirley Peng/Medium, Sept 2025](https://medium.com/@shirley_peng/forecast-categories-in-salesforce-f462ff15a1b8)). Users with field-level access can manually override the category independently of the Stage.
- HubSpot uses an identical model, and ships a generated workflow ("Forecast Category Mapping for Pipeline: [name]") that auto-updates the category on stage change; admins can clone and disable the default to customize ([HubSpot](https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool)).
- Clari/Gong/BoostUp don't own the master category — they sync it from the CRM and expose manager "judgment" / "IN/OUT" overlays on top without disturbing the underlying CRM value.

### 1.3 Rollup: single vs cumulative
- **Single** rollup: each column is the sum of *only* that category.
- **Cumulative** rollup (Russian-doll): each higher-confidence column includes itself + all more-confident columns (Closed ⊂ Commit ⊂ Most Likely ⊂ Best Case ⊂ Open Pipeline). Given `P=100, B=200, C=300, CL=400`, cumulative shows `1000 | 900 | 700 | 400` ([Peng, Medium, Sept 2025](https://medium.com/@shirley_peng/forecast-categories-in-salesforce-f462ff15a1b8)).
- Salesforce cumulative labels are customizable since Summer '22 ([Salesforce Ben — Complete Guide to Salesforce Forecasting](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)).

### 1.4 Who can move a deal + audit trail
- **AE / deal owner**: moves between categories (with field-level permission) and/or via stage transitions.
- **Sales manager**: in Salesforce, uses **Manager Judgments** (`IN`/`OUT`) at the deal level — override without mutating the CRM Stage or Forecast Category, surfacing "Total IN" on hover ([Salesforce Ben](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)). In Clari/Forecastio these appear as separate "Manager Override" columns.
- **Audit trail**: Salesforce tracks Forecast history and adjustments. Modern platforms (Forecastio, Clari, Gong) add **forecast snapshots** (every submission stored), **field-level diffs** (who changed category, when, from/to), and deal-level "Change Signals / Push counts" showing how many times close-date or amount pushed ([Salesforce Ben — Winter '24 Change Signals](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)). Forecastio surfaces a "Forecast Discipline Analysis" that flags reps with frequent category churn.

---

## 2. Probability-of-Winning Methodologies

### 2.1 Methodologies in order of sophistication

| Method | How probability is computed | Where used |
|---|---|---|
| **Stage-based (fixed)** | Admin sets `Probability` % per Stage picklist value; `Weighted = Amount × Probability` | Salesforce native, HubSpot "Weighted amount" (Amount × Deal probability), Pipedrive default |
| **Historical stage conversion** | Probability = historical win% for all deals that ever reached that stage | Forecastio, Drivetrain, BoostUp's "evidence-based scoring" |
| **Weighted pipeline with segmentation** | Probabilities re-computed by segment, rep, product line, deal size | Clari Flow, Anaplan |
| **AI / ML deal scoring (supervised)** | Per-deal score (0–100) based on 30–100+ features | Salesforce Einstein Opportunity Scoring, Gong AI Deal Predictor, Clari AI, Aviso, BoostUp/Terret, Forecastio 2-layer ML |
| **Hybrid (human + ML)** | Rep assigns category; ML displays a probability alongside; manager can override with reason | Gong, Forecastio, Clari (current best practice) |

### 2.2 ML scoring signals — what every platform ingests

From Gong's "Under the hood of deal likelihood scores" ([help.gong.io, Feb 2026](https://help.gong.io/docs/explainer-under-the-hood-of-deal-likelihood-scores)), **50% of signals are conversation-intelligence-derived** (the rest are activity/contacts/timing/historical):

- **Conversations** — mentions of legal, pricing, procurement; competitor mentions; red-flag phrases in emails; call interaction stats.
- **Activity** — days since last call/email/meeting; "no next meeting scheduled"; prospect ghosting.
- **Contacts** — number of contacts; seniority / decision-maker power; multithreading depth.
- **Deal progression** — velocity through stages; amount changes; close-date pushes; deal age; proximity to close date.
- **Historical performance** — rep win rates; stage win rates; forecast-category win rates; time-in-stage baselines.

Gong explicitly uses a **multi-model architecture**: (1) a pre-trained base model on "billions of interactions" across all customers, (2) a per-tenant customization trained on 2 years of that customer's closed deals, (3) daily re-scoring — weights change per deal per day rather than being rule-based. Advertised precision: 21% better than rep intuition by week 4 of the quarter ([help.gong.io](https://help.gong.io/docs/explainer-under-the-hood-of-deal-likelihood-scores)).

**Gong's 3 pillars** ([gong.io blog, Nov 2025](https://www.gong.io/blog/inputs-for-ai-powered-revenue-forecasting-platforms)):
1. Historical performance patterns (seasonality, close rates by segment).
2. Live customer interaction signals (engagement, sentiment, content signals).
3. Real-time deal activity data (stakeholder dynamics, activity velocity, progression signals).

**Salesforce Einstein Opportunity Scoring** ([Salesforce Ben](https://www.salesforceben.com/what-is-salesforce-einstein-opportunity-scoring/); [Spring '26 PDF](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/sales_ai_for_everyone.pdf)):
- 1–99 score on every open Opportunity, removed when closed.
- Requires ≥200 Closed Won and ≥200 Closed Lost opps in past 2 years, each with ≥2-day lifespan and ≥1 post-creation edit.
- Model retrains monthly. Admin can exclude custom fields and scope records via criteria.
- UI shows top positive/negative factors (e.g., "Past wins with this account", "Close date keeps being delayed", "Opportunity stuck in current stage").

**Forecastio's two-layer ML** ([forecastio.ai, Mar 2026](https://forecastio.ai/blog/forecast-categories)):
1. Layer 1: deal-level win-probability.
2. Layer 2: close-date prediction (time-series + behavioral data).

**BoostUp / Terret "evidence-based" scoring** ([spotlight.ai, Apr 2026](https://www.spotlight.ai/post/ai-deal-scoring-forecast-accuracy)) replaces stage-based categories entirely with per-deal probabilities derived from qualification evidence.

**Aviso** uses "a host of traditional and deep learning models optimally reconciling a top-down and bottom-up approach" ([aviso.com, Feb 2025](https://www.aviso.com/blog/consumption-forecasting-the-what-why-and-how)), with a time-series DB underpinning real-time updates.

### 2.3 Displaying probability — rep vs manager
- **Reps** see the score inline on deal panels with top positive/negative factors, plus the bucket (Low 0–35, Fair 36–74, High 75–100 in Gong); scoring is "contextual insight" to guide the rep's manual category assignment.
- **Managers** see score aggregations at deal-board / forecast-board level: distribution of probabilities, "risky Commit" deals (Commit with <70% ML probability), and ability to override with a recorded reason note.
- Score-vs-category disagreement is the most-used **exception surface** (Commit + Low score = red flag; Best Case + High score = upgrade candidate).

---

## 3. Key KPIs and Their Formulas

| KPI | Canonical formula | Notes / source |
|---|---|---|
| **Win Rate** | `Won Deals / (Won + Lost Deals)` in a cohort; can be computed by stage, rep, segment | Forecastio Weighted Pipeline guide |
| **Pipeline Coverage (simple)** | `Total Pipeline Value / Sales Target` for a period | [Forecastio](https://forecastio.ai/blog/pipeline-coverage); benchmarks 3–5× enterprise, 2.5–4× mid-market, 2–3× SMB |
| **Required Coverage (derived)** | `Target / Win Rate` — e.g., 25% win rate + $400K target ⇒ 4× coverage needed | Forecastio |
| **Weighted Pipeline** | `Σ (Deal Amount × Stage Probability)` | HubSpot "Weighted amount" setting; Drivetrain |
| **ACV (Annual Contract Value)** | `(TCV − one-time fees) / Contract Years`. `TCV = Monthly Fees × Months + One-time fees` | [Close.com](https://www.close.com/blog/arr-vs-acv), Stripe, Paddle |
| **ARR (Annual Recurring Revenue)** | `Recurring revenue per year + Expansion − Contraction − Churn ± adjustments` | Close.com; Ordway; Stripe |
| **New ARR** | New-logo ARR booked in period (excludes expansions, renewals) | Ordway glossary |
| **Expansion ARR** | Upsell + cross-sell + upgrade ARR in period | Stripe |
| **CARR** | Committed ARR — includes signed-but-not-yet-live contracts | Mercury |
| **MRR** | `ARR / 12`, or computed for the month directly; split into New / Expansion / Contraction / Churn | Close.com |
| **Sales Cycle Length** | Median (preferred over mean) days from opp Created → Closed Won, by segment | Forecastio |
| **Deal Velocity** | `(Open Opps × Avg Deal Size × Win Rate) / Avg Sales Cycle Length` | Standard "sales velocity" formula; Forecastio |
| **Quota Attainment %** | `Closed Won in period / Quota for period`, surfaced as a progress bar in SFDC forecast view | Salesforce Ben |
| **Linearity** | % of quarterly revenue booked by week N / ideal straight-line % (e.g., week 6 of 13 → 46%) | Clari, Gong (see "on-trajectory to quota") |
| **Forecast Accuracy (simple)** | `1 − |Actual − Forecast| / Actual` | Optifai glossary; Forecastio |
| **MAPE** | `mean( |Actual_t − Forecast_t| / Actual_t )` over N periods | Forecastio accuracy guide |
| **sMAPE** | `mean( |A − F| / ((A + F)/2) )` — bounded 0–200%, symmetric | Forecastio |
| **WAPE** | `Σ|A − F| / Σ|A|` — weights by actual revenue | Terret/Spotlight: [terret.ai](https://www.terret.ai/resources/how-to-measure-sales-forecast-accuracy-3-methods) |
| **Forecast Bias** | Signed average error over N periods; positive = optimistic, negative = sandbagging | Forecastio |
| **Slippage Rate** | % of deals that move close date into a later period; measured per rep, per period | Forecastio ("deal slippage is a process problem, not a model problem") |
| **Push Count** | Number of times close-date has been pushed on a given deal; surfaced as a deal-level chip in Salesforce/Clari/Gong | Salesforce Winter '24 "Change Signals" |
| **Consumption / Usage-Based Forecast** | Top-down (account/workload projections from usage time-series) + bottom-up (deal pipeline) reconciled | Clari, Aviso (see §6) |
| **Net New Logos / Net New Users** | `Logos Acquired in period − Logos Churned in period`; "Net New Users" identical at user level | RevPartners "Hidden Costs of Chasing Net New Logos" |

**Accuracy benchmarks** (Forecastio, Mar 2026): world-class 80–95%, average B2B 50–70%, lagging <50%. SiriusDecisions: 79% of orgs miss forecast by >10%; Gartner: <50% of sales leaders trust their forecast.

---

## 4. Forecast Roll-ups & Submission Workflows

### 4.1 Hierarchy models
Two rollup trees are supported by essentially every platform:
- **Role hierarchy** (default in Salesforce; org-chart parent/child)
- **Territory hierarchy** (preferred for enterprise, supports overlay and shared accounts)

Clari supports both ([community.clari.com, Aug 2023](https://community.clari.com/product-q-a-6/handling-rep-movement-with-the-salesforce-role-hierarchy)). Salesforce's forecast hierarchy "does not need to be the same as your role hierarchy" ([Salesforce Ben guide](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)).

### 4.2 Submission flow (canonical)
1. **Cadence reminder** (Mon or Fri weekly is most common) — Gong sends both in-app and Slack pings ([help.gong.io](https://help.gong.io/docs/how-to-forecast-1)).
2. **Rep submits** a number per forecast category (Commit / Best Case / Pipeline) per period, with an optional text note for the manager.
3. **Manager review / adjust**:
   - **Adjustment** (additive override that doesn't touch the deal records; Salesforce Collaborative Forecasts).
   - **Manager Judgment IN/OUT** (deal-level override; "Total IN" surfaces when hovering on Commit cell).
   - **Override with note** (Forecastio forces a written rationale).
4. **Rollup** computes automatically up the hierarchy; manager submits the *team* number (which may differ from sum-of-reps).
5. **VP/CRO** sees rollup across regions/segments; submits a company-level commit to the board.
6. **Lock / attest** (mostly at quarter-end): Salesforce & Gong support period locks so no further submissions can change the historical number; each rep "attests" to their final commit.

### 4.3 Snapshots & audit trail
- Every submission is captured as a **forecast snapshot** timestamped and diffable.
- Forecastio's Audit Trail records "who changed what, when" at both submission and category-assignment level ([forecastio.ai](https://forecastio.ai/forecast-audit-trail)).
- Clari exposes "Flow Analytics" for pipeline deltas between any two snapshots (new, won, lost, slipped, pulled in, pushed out, amount changed) ([clari.com Flow Analytics](https://www.clari.com/blog/no-more-pipeline-surprises-introducing-flow-analytics/)).

### 4.4 "Submission changes" UX
Gong and Forecastio both expose a small chart in the submission panel showing how that submission trended day-by-day through the quarter ([help.gong.io](https://help.gong.io/docs/how-to-forecast-1)). This is a lightweight yet powerful way to expose forecast drift to the rep.

---

## 5. Time Periods, Fiscal Calendars, Cadence

- **Submission cadence**: weekly (most B2B), daily for ops-heavy teams, monthly for long-cycle deals. Gong configures cadence per board; HubSpot supports monthly or quarterly forecast periods at the org level ([HubSpot docs](https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool)).
- **Close period**: Quarter (B2B SaaS default) or Month (SMB, transactional).
- **Fiscal calendars**: Salesforce supports both standard (Gregorian) and custom fiscal years (4-4-5, 4-5-4, 52/53-week retail); forecasts honor the chosen fiscal year. Clari/Gong mirror this from Salesforce.
- **Multi-period views**: sales leaders routinely need "this quarter", "next quarter", "FY", and "trailing 4 quarters". Forecast types can be scoped to custom dates (e.g., subscription start date, delivery date) instead of `CloseDate` ([Salesforce Ben](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)).
- **Gong Inactive vs Excluded members**: inactive reps still show in historical views if they have relevant data; excluded users are fully removed from rollups, analytics, and projections ([help.gong.io "How to forecast"](https://help.gong.io/docs/how-to-forecast-1)). This matters for mid-quarter attrition.

---

## 6. Deal Data Model — What Fields Do Deals Carry?

### 6.1 Core Opportunity / Deal fields (Salesforce-derived baseline)
Beyond the standard `Opportunity` object, the typical model includes:

- **Identity & ownership**: `Id`, `Name`, `OwnerId`, `AccountId`, `CurrencyIsoCode`.
- **Stage & forecast**: `StageName`, `Probability`, `ForecastCategory`, `ForecastCategoryName`.
- **Amounts**: `Amount`, `ExpectedRevenue` (= Amount × Probability), plus custom currency fields like `ACV`, `ARR`, `TCV`, `NetNewARR`, `ExpansionARR`, `Discount`.
- **Dates**: `CreatedDate`, `CloseDate`, `LastStageChangeDate`, `LastActivityDate`, `NextStep`, custom `ContractStart`, `ContractEnd`, `GoLiveDate`.
- **Segmentation**: `Type` (New Business / Renewal / Upsell), `LeadSource`, `RecordTypeId` (region/product line), `Segment`, `Industry`.
- **Methodology fields**: champion, economic buyer, decision criteria, decision process, paper process, pain (MEDDIC/MEDDPICC), plus bespoke qualification checkboxes.
- **Risk signals** (added by revenue platforms): `HealthScore`, `WinProbability`, `ChangeSignals`, `PushCount`, `StagnantDays`.
- **Manager overlays**: `Manager_Judgment__c` (IN/OUT/Null), `Manager_Override_Commit__c`, `Override_Reason__c`.

### 6.2 Multi-product / multi-line-item
All enterprise forecasting tools model line items explicitly:

- `OpportunityLineItem` / `Deal Product` rows (each with `Quantity`, `UnitPrice`, `TotalPrice`, `ProductCode`, `Product2Id`).
- **Forecast by line item** allows different products to map to different forecast types (e.g., License vs Services vs Maintenance) with independent category rollups. Salesforce supports `OpportunityLineItem` as a first-class forecast object ([Salesforce Ben](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)).
- **Revenue Schedules / Line-Item Schedules**: decompose a deal into monthly revenue across the contract term — `LineItemSchedule(Date, Revenue, Quantity)`. Essential for subscription revenue recognition and rolling 12-month forecasts ([Salesforce Forecasts PDF](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf)); [Gary Smith Partnership](https://garysmithpartnership.com/product-schedules/).
- **Opportunity Splits / Product Splits**: allocate credit among AE + SE + overlay + CSM based on % of Amount or per-product. Salesforce has native support, with splits forecast types so each specialist forecasts off their split.

### 6.3 Consumption / usage-based data (separate from bookings)
Subscription-only data models break when billing is metered. Leading platforms add a parallel workload model:

- **Account-level consumption time-series**: `Account × Workload × Date → UsageUnits × UnitPrice → Revenue` stored in a warehouse (Snowflake, Databricks, Postgres, BigQuery), not in CRM.
- **Contract/entitlement object** with `ACR` (Annual Committed Revenue), `CommitUnits`, `OveragePrice`, `BurnRate`, `DaysToOverage`.
- Clari "Forecast for Consumption" brings Snowflake/Postgres/Databricks data into the same UI as CRM bookings, at both *account* and *workload* level, for real-time run-rate and overage forecasting ([clari.com, Oct 2024](https://www.clari.com/blog/master-consumption-forecasting-flexible-pricing/)).
- Aviso's architecture does the same: "real-time 'consumption-based' forecasting based on data in Snowflake, in addition to traditional 'opportunity-based' data in Salesforce, Microsoft Dynamics, SAP, Oracle, HubSpot, Veeva" ([aviso.com, Feb 2025](https://www.aviso.com/blog/consumption-forecasting-the-what-why-and-how)). Claimed 98% accuracy on ACR at New Relic.
- **Key principle** (both Clari and Aviso): keep *committed bookings* and *consumption* as **separate forecast streams** and reconcile via a *hybrid* view. Don't collapse them into one number.

### 6.4 Relationship graph
Leading revenue intelligence platforms add a **revenue graph** layer on top of CRM:
- `Activity` (email, meeting, call) ↔ `Contact` ↔ `Account` ↔ `Opportunity` with conversation-intelligence metadata (sentiment, topics, red flags).
- Contact enrichment: role, seniority, whether they have "the power you need" (Gong).
- Relationship scores (Aviso, Clari Align) showing breadth and depth of engagement.

---

## 7. Scenario Planning / What-If

All enterprise forecasting tools now support scenario modeling; the pattern is remarkably consistent:

**Aviso Scenario Forecasting** ([aviso.com, Feb 2024](https://www.aviso.com/blog/aviso-scenario-forecasting)) — the most clearly documented pattern — models scenarios as:

- **Scenario entity** with name/description; private by default, shareable with Edit/Read-only ACLs.
- **Buckets** inside a scenario (Commit / Best Case / Run-Rate / custom). Deals can be added/removed across buckets and amounts tweaked *without mutating* source records.
- **Computed fields**: `Scenario Total`, `Gap to Plan`, `Scenario Health` (color-coded against the gap), per-bucket totals.
- **Run-rate bucket**: projects recurring revenue patterns (subscriptions, renewals) as a separate bucket alongside deal-level bets.
- **AI recommendations per bucket**: deals at risk, next steps, probability-weighted deal moves.
- Out-of-the-box scenarios: `Deal Level`, `Best Case`, `Worst Case`; custom `Segment`, `Discount` scenarios supported.

**Clari Scenario / Forecastio What-If** supports similar: "what happens to the forecast if win rate drops 5%?", "if Rep X leaves?" — parameters are win-rate, sales-cycle, pipeline-generation, and close-rate multipliers applied against the current pipeline.

**Anaplan** ([anaplan.com](https://www.anaplan.com/solutions/quota-planning-and-management/)) — the go-to for *top-down* scenario planning (quota/territory/headcount simulation), complementing bottom-up pipeline forecasting. Uses a Hyperblock multi-dimensional engine so any driver change (territory coverage, new-rep ramp, ASP, cycle length) flows through to forecast instantly.

**Design principle**: scenarios must be **non-destructive overlays** — never mutate the underlying opportunity, line item, or forecast record. Model them as child rows that *reference* source records with per-row amount/date/bucket overrides.

---

## 8. Forecast Accuracy Measurement & Bias Detection

### 8.1 Metrics stack (use multiple)
From Terret ([Feb 2026](https://www.terret.ai/resources/how-to-measure-sales-forecast-accuracy-3-methods)) and Forecastio ([Mar 2026](https://forecastio.ai/blog/sales-forecasting-accuracy-and-analysis)):
- **Forecast Accuracy %** — intuitive headline.
- **MAE / WAPE** — weighted absolute error across periods.
- **MAPE / sMAPE** — percentage error, sMAPE preferred when actuals can be very small.
- **Bias** — signed average error (optimism vs sandbagging).
- **Slippage rate** — orthogonal process metric.

Best practice: track all four dimensions and present the **bias chart alongside the accuracy chart** — a team can be 95% accurate on average but systematically optimistic by 8% with 12% volatility.

### 8.2 Where to compute them
- **Per rep, per period, per category** — cohort view. Example: Rep A forecasts $500K, closes $300K → 60% accuracy, +67% bias. Rep B forecasts $200K, closes $250K → 80% accuracy, −20% bias.
- **By forecast category** — "Commit-category accuracy" is the money metric; world-class teams hit 90%+.
- **By stage / segment / product line** — reveals where slippage concentrates.

### 8.3 Calibration loop
Forecastio's "Forecast Calibration" workflow:
1. Compute systematic bias over last N periods.
2. Derive a multiplier (e.g., reps were +15% too high → multiply next commit by 0.85).
3. Show the calibrated number as a "system-adjusted" commit alongside the raw submission.
4. Refresh every quarter.

### 8.4 Bias surfaces reps/managers see
- **Rep forecast discipline scorecard**: submissions vs actuals over last 4–8 quarters, with optimism/sandbagging trend lines.
- **Coaching flag**: if |bias| > 15% over 3 periods, the rep is auto-flagged for a coaching conversation.
- **Self-correction nudges**: Forecastio shows rep their own historic Commit accuracy (e.g., "Your Commit historically closes at 72%") in the submission panel.

---

## 9. Cohort Analysis — Net-New Logos / Users

Cohort analysis is underbuilt in most forecasting tools but critical for SaaS. Patterns observed:

- **Acquisition cohort**: group customers by *signup quarter* (or first-close-won). Track `MRR`, `NRR`, `Logo Retention`, `Seat Expansion` over subsequent months.
- **Product cohort**: group by first-product-purchased to model cross-sell.
- **Rep/AE cohort**: group deals by AE to surface ramp curves for new reps — critical for quota planning (Anaplan territory module).
- **Segment × fiscal-period matrix**: industry-standard "cohort triangle" (rows = acquisition period, cols = age, cells = retention/expansion %).
- **Forecasting use**: Forecastio's Cohort Analysis technique reveals "rep A optimism bias" and "stage conversion degradation over time" ([Forecastio accuracy guide, Mar 2026](https://forecastio.ai/blog/sales-forecasting-accuracy-and-analysis)).
- **Net New Logos warning**: RevPartners ([Sep 2025](https://blog.revpartners.io/en/revops-articles/the-hidden-costs-of-chasing-those-net-new-logos)) notes hidden cost of over-indexing on NNL without tracking net-expansion cohorts — NNL metric alone misses that retention + expansion is 2–3× cheaper than acquisition.

**Recommended cohort tables for a forecasting app**:
- `logo_cohorts(acquisition_period, cohort_size, by_month_logos_retained, by_month_arr_retained)`
- `user_cohorts(first_seat_period, cohort_size, by_month_seats_retained)`
- `product_cohorts(first_product, account_id, expansion_products)`
- `rep_ramp_cohorts(hire_period, rep_id, by_month_quota_attainment)`

---

## 10. Data Ingestion Patterns from CRM (Salesforce)

### 10.1 Primary sync model: bi-directional with CRM as system of record
All leading revenue platforms (Clari, Gong, BoostUp, Aviso, Outreach, Forecastio) use **bi-directional sync with Salesforce as the system of record for the Opportunity**, but each platform owns its own "forecast submission" and "manager override" objects.

- **Read path**: subscribe to Salesforce Bulk/Streaming/PushTopic APIs (CDC — Change Data Capture) for near-real-time updates on Account, Contact, Opportunity, OpportunityLineItem, User, Event, Task. Field-level subscription so only relevant columns are pulled.
- **Write path**: when a rep updates a deal inside Clari/Gong UI, the change is written back to SFDC via Composite API; conflicts are resolved with **CRM-wins on conflict** (last-write-wins with the CRM timestamp canonical) ([Ampersand, Mar 2026](https://www.withampersand.com/blog/the-anatomy-of-a-deep-salesforce-sync-integration)).
- **Initial backfill**: full-table export via Bulk API 2.0, staged to a data warehouse, then incremental CDC takes over.

### 10.2 Custom object + field mapping
- Admins configure per-customer field maps: `sf.Opportunity.CustomField__c → platform.Deal.custom_field`. Most platforms auto-detect custom objects and present a pick-list UI (Forecastio Field Configuration, Clari Field Configuration).
- Field metadata (type, precision, picklist values) is introspected via `sObject describe` calls; schema drift detection triggers a notification when customer admins add new fields.
- **Custom objects** (for renewals, subscriptions, consumption commits) are also supported as forecast targets — Salesforce's own Collaborative Forecasts supports Opportunity, Opportunity Product, Opportunity Split, Product Split, and Line Item Schedule objects ([Salesforce Ben](https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/)).

### 10.3 Non-CRM data sources
Consumption forecasting requires pulling directly from the data warehouse:
- Snowflake, Databricks, BigQuery, Postgres as first-class data sources.
- Time-series tables for usage events.
- Multi-CRM "Consolidated Views" pattern (Clari): toggle between CRMs or roll forecasts up from multiple Salesforce orgs ([Clari, Oct 2024](https://www.clari.com/blog/master-consumption-forecasting-flexible-pricing/)). Essential post-acquisition or for multi-subsidiary enterprises.

### 10.4 Integration user & permissions
- Each platform uses a dedicated **integration user** with a specific permission set, to isolate sync activity from user-level audit trails.
- Clari's community explicitly recommends keeping integration user separate from real-user impersonation to preserve field-level security ([community.clari.com](https://community.clari.com/getting-started-in-the-community-2/crm-sync-1804)).

### 10.5 Conflict handling
- **Per-field ownership**: admin declares which system owns each field (e.g., `StageName` owned by CRM; `WinProbability` owned by platform ML model; `ForecastCategory` owned by rep via CRM; `Manager_Judgment__c` owned by platform).
- **Event queue on clash**: competing writes are queued and reconciled every N minutes with conflict detection. Gong guarantees no CRM data loss by letting CRM write always win, while treating in-platform edits as optimistic and surfacing errors if SFDC rejects them.

---

## Cross-Cutting Design Recommendations (for your product)

1. **Own an override layer, not a rewrite layer.** Never mutate the CRM Stage/Forecast Category. Store your judgments/overrides in platform-owned rows with `deal_id, overridden_by, from_value, to_value, reason_text, ts`.
2. **First-class forecast snapshot.** Every submission + every category change is an immutable event record. This is non-negotiable for audit and calibration.
3. **Multi-stream forecast**: separate `bookings_forecast`, `consumption_forecast`, `renewals_forecast`, `services_forecast`, reconciled in a unified dashboard. Don't collapse.
4. **Line-item first.** Model at OpportunityLineItem level from day one; single-amount deals become a 1-line special case. This unlocks revenue schedules, multi-product forecasting, and splits without a rewrite.
5. **Two probabilities, always.** Store both `stage_probability` (rules-based, editable) and `ml_probability` (model-derived). Surface disagreement as a coaching signal.
6. **Explainable scores.** Follow Salesforce Einstein / Gong pattern: every score ships with top positive/negative factors. Never show a black-box number.
7. **Scenario as overlay.** Scenarios are child rows with `scenario_id, deal_id, amount_override, category_override, included:bool, note`. The parent deal is untouched.
8. **Cadence-aware UI.** Submissions, snapshots, and reminders all key on a configurable `fiscal_period` with support for 4-4-5 and custom calendars.
9. **Bias + slippage alongside accuracy.** MAPE is not enough. Track signed bias, slippage rate, and push count per rep/period.
10. **Hierarchy as a separate object.** Don't hard-couple to org chart — model `forecast_hierarchy(user_id, parent_id, type: role|territory, effective_from, effective_to)` so re-orgs during a quarter don't break rollups.

---

## Sources (primary where possible)

### Clari
- Defining Sales Forecast Categories to Drive Reliable Revenue — https://www.clari.com/blog/defining-sales-forecast-categories-to-drive-reliable-revenue/
- Mastering Consumption Forecasting & Flexible Pricing Models (Oct 2024) — https://www.clari.com/blog/master-consumption-forecasting-flexible-pricing/
- Clari Flow Analytics — https://www.clari.com/blog/no-more-pipeline-surprises-introducing-flow-analytics/
- Clari Customer Community CRM Sync — https://community.clari.com/getting-started-in-the-community-2/crm-sync-1804
- Handling Rep Movement with Salesforce Role Hierarchy — https://community.clari.com/product-q-a-6/handling-rep-movement-with-the-salesforce-role-hierarchy

### Gong
- Understanding Gong Deals (Mar 2026) — https://help.gong.io/docs/understanding-gong-deals
- Under the hood of deal likelihood scores (Feb 2026) — https://help.gong.io/docs/explainer-under-the-hood-of-deal-likelihood-scores
- How to forecast (Jan 2026) — https://help.gong.io/docs/how-to-forecast-1
- Key Data Inputs for AI Forecasting (Nov 2025) — https://www.gong.io/blog/inputs-for-ai-powered-revenue-forecasting-platforms

### Salesforce
- Pipeline Forecasting Implementation Guide (Spring '26) — https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf
- Einstein Opportunity Scoring for Everyone (Spring '26) — https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/sales_ai_for_everyone.pdf
- Salesforce Ben: Complete Guide to Salesforce Forecasting — https://www.salesforceben.com/complete-guide-to-salesforce-forecasting/
- Salesforce Ben: Forecast Categories — https://www.salesforceben.com/forecast-categories-in-salesforce-everything-you-need-to-know/
- Salesforce Ben: Einstein Opportunity Scoring — https://www.salesforceben.com/what-is-salesforce-einstein-opportunity-scoring/
- Shirley Peng, Medium (Sept 2025) — https://medium.com/@shirley_peng/forecast-categories-in-salesforce-f462ff15a1b8

### HubSpot
- Set up the forecast tool (Feb 2026) — https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool

### BoostUp / Terret
- Terret homepage (product behavior) — https://www.terret.ai/
- Spotlight.ai: AI Deal Scoring vs Forecast Categories (Apr 2026) — https://www.spotlight.ai/post/ai-deal-scoring-forecast-accuracy
- Spotlight.ai: Why Sales Forecasting Is Still Broken in 2026 — https://www.spotlight.ai/post/sales-forecasting-broken-2026

### Aviso
- Scenario Forecasting (Feb 2024) — https://www.aviso.com/blog/aviso-scenario-forecasting
- Consumption Forecasting (Feb 2025) — https://www.aviso.com/blog/consumption-forecasting-the-what-why-and-how
- Predictive Sales Forecasting (Feb 2026) — https://www.aviso.com/blog/predictive-sales-forecasting-real-world-implementation-and-roi

### Forecastio (secondary aggregator, but well-sourced)
- Forecast Categories (Mar 2026) — https://forecastio.ai/blog/forecast-categories
- Pipeline Coverage (Mar 2026) — https://forecastio.ai/blog/pipeline-coverage
- Sales Forecasting Accuracy and Analysis (Mar 2026) — https://forecastio.ai/blog/sales-forecasting-accuracy-and-analysis

### KPIs / Metrics
- Close.com: ARR vs ACV — https://www.close.com/blog/arr-vs-acv
- Stripe: ACV vs ARR — https://stripe.com/resources/more/acv-vs-arr-what-each-metric-really-means
- Mercury: ACV vs ARR vs MRR vs CARR (Mar 2026) — https://mercury.com/blog/acv-arr-carr-mrr-overview
- Terret: How to Measure Sales Forecast Accuracy — https://www.terret.ai/resources/how-to-measure-sales-forecast-accuracy-3-methods

### Outreach
- Outreach Commit: Deals — https://support.outreach.io/hc/en-us/articles/5653618042267-Outreach-Commit-How-to-use-Deals
- Pipeline Coverage: Complete Guide — https://www.outreach.ai/resources/blog/sales-pipeline-coverage-ratio

### Anaplan
- Quota Planning and Management — https://www.anaplan.com/solutions/quota-planning-and-management/
- Territory and Quota Planning — https://www.anaplan.com/applications/territory-and-quota-planning-app/

### Salesforce Sync Technical
- Ampersand: The anatomy of a deep Salesforce sync integration (Mar 2026) — https://www.withampersand.com/blog/the-anatomy-of-a-deep-salesforce-sync-integration

### Mediafly / InsightSquared
- Mediafly Acquires InsightSquared (Dec 2021) — https://www.insightsquared.com/blog/mediafly-acquires-insightsquared/
