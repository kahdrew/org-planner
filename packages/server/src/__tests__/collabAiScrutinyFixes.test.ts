/**
 * Tests for the collab-ai scrutiny fixes (fix-collab-ai-scrutiny feature).
 *
 * Ensures that SSE events are emitted for employee mutations originating
 * from non-employeeController paths:
 *
 *   1. Headcount approval materialization (final approve step)
 *      → emits `employee.created` for new-hire approvals
 *      → emits `employee.updated` for comp-change approvals
 *   2. Scheduled change application (both HTTP and internal entry points)
 *      → emits `employee.updated` for regular edits
 *      → emits `employee.moved` when the change sets `managerId`
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { registerAgent, type TestAgent } from "./helpers/authAgent";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import ApprovalChain from "../models/ApprovalChain";
import HeadcountRequest from "../models/HeadcountRequest";
import ScheduledChange from "../models/ScheduledChange";
import AuditLog from "../models/AuditLog";
import { eventBus, SseEvent } from "../sse/eventBus";
import { applyDueChangesForScenario } from "../controllers/scheduledChangeController";

const TEST_PREFIX = `collab_ai_scrutiny_${Date.now()}`;

let ownerAgent: TestAgent;
let ownerUserId: string;
let managerAgent: TestAgent;
let managerUserId: string;
let vpAgent: TestAgent;
let vpUserId: string;

let orgId: string;
let scenarioId: string;
let chainId: string;

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: "TestPass123!",
    name: `${suffix} User`,
  };
}

async function registerUser(
  suffix: string,
): Promise<{ agent: TestAgent; id: string }> {
  const agent = await registerAgent(app, testCreds(suffix));
  const me = await agent.get("/api/auth/me");
  return { agent, id: me.body.user.id };
}

async function acceptInviteAsAdmin(email: string, inviteeAgent: TestAgent) {
  const inv = await ownerAgent
    .post(`/api/orgs/${orgId}/invite`)
    .send({ email, role: "admin" });
  await inviteeAgent.post(`/api/invitations/${inv.body._id}/accept`);
}

async function createEmployee(
  actingAgent: TestAgent,
  overrides: Record<string, unknown> = {},
) {
  const res = await actingAgent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({
      name: "Base Emp",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "Remote",
      employmentType: "FTE",
      status: "Active",
      ...overrides,
    });
  return res.body;
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const owner = await registerUser("owner");
  ownerAgent = owner.agent;
  ownerUserId = owner.id;

  const manager = await registerUser("manager");
  managerAgent = manager.agent;
  managerUserId = manager.id;

  const vp = await registerUser("vp");
  vpAgent = vp.agent;
  vpUserId = vp.id;

  const orgRes = await ownerAgent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  await acceptInviteAsAdmin(testCreds("manager").email, managerAgent);
  await acceptInviteAsAdmin(testCreds("vp").email, vpAgent);

  const scenarioRes = await ownerAgent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Collab AI Scrutiny Scenario" });
  scenarioId = scenarioRes.body._id;

  // Simple 2-step default chain.
  const chainRes = await ownerAgent
    .post(`/api/orgs/${orgId}/approval-chains`)
    .send({
      name: "Collab AI Chain",
      description: "Chain for collab-ai scrutiny tests",
      isDefault: true,
      steps: [
        { role: "Manager", approverIds: [managerUserId] },
        { role: "VP", approverIds: [vpUserId] },
      ],
    });
  chainId = chainRes.body._id;
  // Suppress unused-var lint warning — we keep these for potential future use.
  void chainId;
  void ownerUserId;
});

afterAll(async () => {
  await HeadcountRequest.deleteMany({ orgId });
  await ApprovalChain.deleteMany({ orgId });
  await ScheduledChange.deleteMany({ scenarioId });
  await AuditLog.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

// Helper: collect every SSE event fanned out to a given orgId by spying on
// eventBus.emit. Returns the spy so callers can filter/inspect.
function startCapture() {
  const events: { orgId: string; event: SseEvent }[] = [];
  const spy = vi
    .spyOn(eventBus, "emit")
    .mockImplementation((targetOrgId: string, event: SseEvent) => {
      events.push({ orgId: targetOrgId, event });
    });
  return { events, spy };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Headcount approval materialization emits SSE events", () => {
  it("emits employee.created on final approval of a new_hire request", async () => {
    // Submit a new-hire request; the default 2-step chain routes it.
    const submission = await ownerAgent
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .send({
        employeeData: {
          name: "SSE Approved Hire",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "Remote",
          employmentType: "FTE",
          salary: 120000,
        },
      });
    expect(submission.status).toBe(201);
    const requestId = submission.body._id;

    // Step 1: manager approves — not the final step, no materialization.
    const approveStep1 = await managerAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({});
    expect(approveStep1.status).toBe(200);

    // Start capturing SSE emissions before the final approval.
    const capture = startCapture();

    // Step 2: VP approves (final step) — triggers materializeEmployee.
    const approveStep2 = await vpAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({});
    expect(approveStep2.status).toBe(200);
    expect(approveStep2.body.status).toBe("approved");
    expect(approveStep2.body.approvedEmployeeId).toBeTruthy();

    // Assert SSE event fan-out happened for this org.
    const createdEvents = capture.events.filter(
      (e) =>
        e.orgId === orgId && e.event.type === "employee.created",
    );
    expect(createdEvents.length).toBeGreaterThan(0);
    const evt = createdEvents[0].event;
    const payload = evt.payload as { employee?: { name?: string; _id?: unknown } };
    expect(payload.employee?.name).toBe("SSE Approved Hire");
    expect(evt.scenarioId).toBe(scenarioId);
  });

  it("emits employee.updated on final approval of a comp_change request", async () => {
    // Seed an existing employee to act as the comp-change target.
    const emp = await createEmployee(ownerAgent, {
      name: "CompChange Target",
      title: "Engineer",
      level: "IC3",
      salary: 130000,
    });

    const submission = await ownerAgent
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .send({
        requestType: "comp_change",
        targetEmployeeId: emp._id,
        employeeData: {
          name: "CompChange Target",
          title: "Engineer",
          department: "Engineering",
          level: "IC4",
          location: "Remote",
          employmentType: "FTE",
          salary: 155000,
        },
      });
    expect(submission.status).toBe(201);
    const requestId = submission.body._id;

    await managerAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({});

    const capture = startCapture();

    const final = await vpAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({});
    expect(final.status).toBe(200);
    expect(final.body.status).toBe("approved");

    const updatedEvents = capture.events.filter(
      (e) =>
        e.orgId === orgId && e.event.type === "employee.updated",
    );
    expect(updatedEvents.length).toBeGreaterThan(0);
    const evt = updatedEvents[0].event;
    const payload = evt.payload as {
      employee?: { _id?: unknown; salary?: number; level?: string };
    };
    expect(String(payload.employee?._id)).toBe(emp._id);
    expect(payload.employee?.salary).toBe(155000);
    expect(payload.employee?.level).toBe("IC4");
  });
});

describe("Scheduled change application emits SSE events", () => {
  it("emits employee.updated when apply-due applies a regular edit", async () => {
    const emp = await createEmployee(ownerAgent, {
      name: "SSE SchedUpdate",
      title: "Engineer",
      level: "IC2",
    });

    await ownerAgent
      .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
      .send({
        employeeId: emp._id,
        effectiveDate: todayIso(),
        changeType: "promotion",
        changeData: { title: "Senior Engineer", level: "IC4" },
      });

    const capture = startCapture();

    const applyRes = await ownerAgent
      .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);
    expect(applyRes.status).toBe(200);

    const updatedEvents = capture.events.filter(
      (e) =>
        e.orgId === orgId && e.event.type === "employee.updated",
    );
    expect(updatedEvents.length).toBeGreaterThan(0);
    const payload = updatedEvents[0].event.payload as {
      employee?: { _id?: unknown; title?: string; level?: string };
    };
    expect(String(payload.employee?._id)).toBe(emp._id);
    expect(payload.employee?.title).toBe("Senior Engineer");
    expect(payload.employee?.level).toBe("IC4");
  });

  it("emits employee.moved when apply-due applies a managerId change", async () => {
    const manager = await createEmployee(ownerAgent, { name: "SSE NewMgr" });
    const reportee = await createEmployee(ownerAgent, { name: "SSE Reportee" });

    await ownerAgent
      .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
      .send({
        employeeId: reportee._id,
        effectiveDate: todayIso(),
        changeType: "transfer",
        changeData: { managerId: manager._id },
      });

    const capture = startCapture();

    const applyRes = await ownerAgent
      .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);
    expect(applyRes.status).toBe(200);

    const movedEvents = capture.events.filter(
      (e) => e.orgId === orgId && e.event.type === "employee.moved",
    );
    expect(movedEvents.length).toBeGreaterThan(0);
    const payload = movedEvents[0].event.payload as {
      employee?: { _id?: unknown; managerId?: unknown };
      previousManagerId?: string | null;
    };
    expect(String(payload.employee?._id)).toBe(reportee._id);
    expect(String(payload.employee?.managerId)).toBe(manager._id);
    expect(payload.previousManagerId).toBeNull();
  });

  it("emits SSE events from applyDueChangesForScenario (internal/middleware path)", async () => {
    const emp = await createEmployee(ownerAgent, {
      name: "SSE InternalApply",
      title: "Coordinator",
    });

    await ownerAgent
      .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
      .send({
        employeeId: emp._id,
        effectiveDate: todayIso(),
        changeType: "edit",
        changeData: { title: "Senior Coordinator" },
      });

    const capture = startCapture();

    const appliedCount = await applyDueChangesForScenario(scenarioId);
    expect(appliedCount).toBeGreaterThanOrEqual(1);

    const updatedEvents = capture.events.filter(
      (e) =>
        e.orgId === orgId &&
        e.event.type === "employee.updated" &&
        String(
          (e.event.payload as { employee?: { _id?: unknown } }).employee?._id,
        ) === emp._id,
    );
    expect(updatedEvents.length).toBeGreaterThan(0);
    const payload = updatedEvents[0].event.payload as {
      employee?: { title?: string };
    };
    expect(payload.employee?.title).toBe("Senior Coordinator");
  });
});
