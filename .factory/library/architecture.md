# Architecture

How the org-planner system works — components, relationships, data flows, invariants.

---

## System Overview

A full-stack org chart and headcount planning application. Users create organizations, build org chart hierarchies within scenarios, and use multiple views to visualize, edit, and plan organizational changes.

## Components

### Frontend (packages/client)
- **Framework**: React 18 + Vite + TypeScript
- **Routing**: react-router-dom v6 with BrowserRouter
- **State**: Zustand stores (authStore, orgStore, scenarioStore, undoRedoStore, selectionStore, invitationStore, scheduledChangeStore, timelineStore, overlayStore, exportStore)
- **Visualization**: @xyflow/react (React Flow) for org chart canvas
- **Data Grid**: AG Grid Community for spreadsheet view
- **Drag-and-Drop**: @dnd-kit for hierarchy and kanban reordering
- **Styling**: Tailwind CSS v4 + clsx + tailwind-merge
- **HTTP**: Axios with `withCredentials: true` for session cookies and 401 redirect handling

### Backend (packages/server)
- **Framework**: Express 4 on Node.js
- **Database**: MongoDB Atlas via Mongoose 8
- **Auth**: bcryptjs for password hashing, express-session + connect-mongo for server-stored session cookies (`SESSION_SECRET`, 7-day cookie maxAge)
- **Validation**: Zod schemas on request bodies
- **Architecture**: Controllers → Routes → Models pattern
- **Authorization**: Role-based (owner/admin/viewer) with org membership middleware

### Deployment
- **Platform**: Vercel (serverless function for API, static for SPA)
- **Entry**: api/index.ts wraps Express app for Vercel
- **Dev**: concurrently runs server (tsx watch, port 3001) + client (Vite, port 5173)
- **Proxy**: Vite proxies /api/* to localhost:3001 in dev mode

## Data Model

```
User (email, passwordHash, name)
  └── owns → Organization (name, ownerId, memberIds[], memberRoles[])
                ├── has → Invitation (email, role, invitedBy, status, token)
                └── has → Scenario (orgId, name, description, baseScenarioId, createdBy)
                            ├── has → Employee (scenarioId, name, title, department, level,
                            │                    location, salary, equity, employmentType,
                            │                    status, managerId, order, startDate,
                            │                    costCenter, hiringManager, recruiter,
                            │                    requisitionId, avatarUrl, metadata)
                            ├── has → ScheduledChange (employeeId, effectiveDate, changeType,
                            │                          changeData, createdBy, status)
                            ├── has → AuditLog (employeeId, action, snapshot, changes, timestamp)
                            └── has → BudgetEnvelope (department, totalBudget, headcountCap)
```

### Key Relationships
- Employee.managerId → Employee._id (self-referential tree within a scenario)
- Employee.managerId = null → root-level employee (CEO/top of hierarchy)
- Scenario.baseScenarioId → Scenario._id (tracks clone origin)
- Organization.memberRoles[] tracks role (owner/admin/viewer) per member

### Invariants
- An employee always belongs to exactly one scenario
- A scenario always belongs to exactly one organization
- The employee hierarchy is a tree (no cycles) within a scenario
- Scenario clone deep-copies all employees and remaps managerId references
- Viewer role cannot modify any data
- Only owners can manage org membership and invite new members

## Views

| Route | View | Component | Primary Interaction |
|-------|------|-----------|-------------------|
| `/` | Org Chart | OrgChartView | React Flow canvas, drag to reparent, click for details |
| `/hierarchy` | Hierarchy | HierarchyView | Collapsible tree, dnd-kit reorder/reparent |
| `/spreadsheet` | Spreadsheet | SpreadsheetView | AG Grid editable table |
| `/kanban` | Kanban | KanbanView | Kanban columns by department or status |
| `/compare` | Compare | CompareView | Side-by-side scenario diff trees |
| `/dashboard` | Dashboard | DashboardView | Analytics widgets |

## Layout Structure

AppShell wraps all views:
- **Sidebar** (left): Org selector, scenario selector, view nav links, new/clone scenario, budget button, scheduled changes, members
- **Toolbar** (top): Add employee, status filter pills, search, CSV import/export, undo/redo, multi-select bulk ops, export chart
- **Main** (center): Active view via Outlet (passes filteredEmployees in context)
- **TimelineSlider** (below main): Timeline with scrub, granularity, markers
- **HeadcountSummary** (bottom): Metric pills (total, FTE, contractors, open reqs, planned, salary)
- **Panels** (overlay): EmployeeDetailPanel, BudgetPanel, MembersPanel, PendingChangesPanel, KeyboardShortcutsHelp
