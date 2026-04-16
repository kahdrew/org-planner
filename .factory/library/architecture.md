# Architecture

How the org-planner system works — components, relationships, data flows, invariants.

---

## System Overview

A full-stack org chart and headcount planning application. Users create organizations, build org chart hierarchies within scenarios, and use multiple views to visualize, edit, and plan organizational changes.

## Components

### Frontend (packages/client)
- **Framework**: React 18 + Vite + TypeScript
- **Routing**: react-router-dom v6 with BrowserRouter
- **State**: Zustand stores (authStore, orgStore, scenarioStore)
- **Visualization**: @xyflow/react (React Flow) for org chart canvas
- **Data Grid**: AG Grid Community for spreadsheet view
- **Drag-and-Drop**: @dnd-kit for hierarchy and kanban reordering
- **Styling**: Tailwind CSS v4 + clsx + tailwind-merge
- **HTTP**: Axios with JWT interceptor (auto-attaches token, redirects on 401)

### Backend (packages/server)
- **Framework**: Express 4 on Node.js
- **Database**: MongoDB via Mongoose 8
- **Auth**: bcryptjs for password hashing, jsonwebtoken for JWT (7-day expiry)
- **Validation**: Zod schemas on request bodies
- **Architecture**: Controllers → Routes → Models pattern

### Deployment
- **Platform**: Vercel (serverless function for API, static for SPA)
- **Entry**: api/index.ts wraps Express app for Vercel
- **Dev**: concurrently runs server (tsx watch, port 3001) + client (Vite, port 5173)
- **Proxy**: Vite proxies /api/* to localhost:3001 in dev mode

## Data Model

```
User (email, passwordHash, name)
  └── owns → Organization (name, ownerId, memberIds[])
                └── has → Scenario (orgId, name, description, baseScenarioId, createdBy)
                            └── has → Employee (scenarioId, name, title, department, level,
                                                  location, salary, equity, employmentType,
                                                  status, managerId, order, startDate,
                                                  costCenter, hiringManager, recruiter,
                                                  requisitionId, avatarUrl, metadata)
```

### Key Relationships
- Employee.managerId → Employee._id (self-referential tree within a scenario)
- Employee.managerId = null → root-level employee (CEO/top of hierarchy)
- Scenario.baseScenarioId → Scenario._id (tracks clone origin)
- Organization.memberIds[] → User._id (org membership, not yet used in endpoints)

### Invariants
- An employee always belongs to exactly one scenario
- A scenario always belongs to exactly one organization
- The employee hierarchy is a tree (no cycles) within a scenario
- Scenario clone deep-copies all employees and remaps managerId references

## Data Flows

### Auth Flow
Browser → POST /api/auth/login → bcrypt verify → JWT signed → stored in localStorage → Axios interceptor attaches to all requests

### CRUD Flow
Component → Zustand action → Axios API call → Express route → Controller → Mongoose model → MongoDB Atlas
Response → Zustand state update → React re-render

### Scenario Diff Flow
Select two scenarios → GET /api/scenarios/:a/diff/:b → Server fetches both employee sets → Compares by name (no stable cross-scenario ID) → Returns {added, removed, moved, changed, unchanged}

## Views

| Route | View | Component | Primary Interaction |
|-------|------|-----------|-------------------|
| `/` | Org Chart | OrgChartView | React Flow canvas, drag to reparent, click for details |
| `/hierarchy` | Hierarchy | HierarchyView | Collapsible tree, dnd-kit reorder/reparent |
| `/spreadsheet` | Spreadsheet | SpreadsheetView | AG Grid editable table |
| `/kanban` | Kanban | KanbanView | Kanban columns by department or status |
| `/compare` | Compare | CompareView | Side-by-side scenario diff trees |

## Layout Structure

AppShell wraps all views:
- **Sidebar** (left): Org selector, scenario selector, view nav links, new/clone scenario, budget button
- **Toolbar** (top): Add employee, status filter pills, search, CSV import/export
- **Main** (center): Active view via Outlet (passes filteredEmployees in context)
- **HeadcountSummary** (bottom): Metric pills (total, FTE, contractors, open reqs, planned, salary)
- **Panels** (overlay): EmployeeDetailPanel (slide-out form), BudgetPanel (slide-out budget breakdown)
