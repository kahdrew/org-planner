/**
 * Server-side tests for the analytics scrutiny fixes:
 *
 * Fix #1: GET /api/scenarios/:id/history projects pending scheduled changes
 *         whose effectiveDate <= targetDate, so scrubbing past an effective
 *         date reflects the planned org state.
 *
 * Fix #2: applyDueChangesForScenario / applyDueChanges write AuditLog
 *         entries so the timeline/history stays in sync with the mutations
 *         performed by scheduled-change application.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import ScheduledChange from "../models/ScheduledChange";
import AuditLog from "../models/AuditLog";

const TEST_PREFIX = `analytics_scrutiny_${Date.now()}`;
let ownerAgent: TestAgent;
let orgId: string;
let scenarioId: string;

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: "changeme",
    name: `${suffix} User`,
  };
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

async function createEmployee(
  actingAgent: TestAgent,
  scenId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await actingAgent
    .post(`/api/scenarios/${scenId}/employees`)
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

  ownerAgent = await registerAgent(app, testCreds("owner"));

  const orgRes = await ownerAgent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  const scenarioRes = await ownerAgent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Analytics Scrutiny Scenario" });
  scenarioId = scenarioRes.body._id;
});

afterAll(async () => {
  await AuditLog.deleteMany({ scenarioId });
  await ScheduledChange.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Analytics scrutiny fixes (server)", () => {
  describe("Fix #1: GET /history projects pending scheduled changes", () => {
    it("applies a scheduled change to history when the scrub date is past its effectiveDate", async () => {
      // Create employee and record its original title in an audit log
      const emp = await createEmployee(ownerAgent, scenarioId, {
        name: "ScrubTarget",
        title: "Engineer",
      });
      // Schedule a future promotion
      const futureEffective = new Date();
      futureEffective.setDate(futureEffective.getDate() + 30);
      const futureEffectiveStr = futureEffective.toISOString().split("T")[0];

      const schedRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: emp._id,
          effectiveDate: futureEffectiveStr,
          changeType: "promotion",
          changeData: { title: "Staff Engineer", level: "IC5" },
        });
      expect(schedRes.status).toBe(201);

      // Scrub past the effective date: scheduled change should project
      const scrubDate = new Date();
      scrubDate.setDate(scrubDate.getDate() + 60);
      const histRes = await ownerAgent
        .get(
          `/api/scenarios/${scenarioId}/history?date=${encodeURIComponent(scrubDate.toISOString())}`,
        );

      expect(histRes.status).toBe(200);
      const projected = (histRes.body as Array<Record<string, unknown>>).find(
        (e) => String(e._id) === emp._id,
      );
      expect(projected).toBeTruthy();
      expect(projected?.title).toBe("Staff Engineer");
      expect(projected?.level).toBe("IC5");

      // Status remains pending in DB — projection is read-only
      const scheduled = await ScheduledChange.findById(schedRes.body._id);
      expect(scheduled?.status).toBe("pending");
    });

    it("does NOT apply a scheduled change when the scrub date is before its effectiveDate", async () => {
      const emp = await createEmployee(ownerAgent, scenarioId, {
        name: "EarlyScrub",
        title: "Analyst",
      });

      const futureEffective = new Date();
      futureEffective.setDate(futureEffective.getDate() + 40);
      const futureEffectiveStr = futureEffective.toISOString().split("T")[0];

      await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: emp._id,
          effectiveDate: futureEffectiveStr,
          changeType: "edit",
          changeData: { title: "Senior Analyst" },
        });

      // Scrub to a date BEFORE the effective date — no projection
      const scrubDate = new Date();
      scrubDate.setDate(scrubDate.getDate() + 10);
      const histRes = await ownerAgent
        .get(
          `/api/scenarios/${scenarioId}/history?date=${encodeURIComponent(scrubDate.toISOString())}`,
        );

      expect(histRes.status).toBe(200);
      const projected = (histRes.body as Array<Record<string, unknown>>).find(
        (e) => String(e._id) === emp._id,
      );
      expect(projected).toBeTruthy();
      expect(projected?.title).toBe("Analyst");
    });

    it("projects only pending changes (not cancelled ones)", async () => {
      const emp = await createEmployee(ownerAgent, scenarioId, {
        name: "CancelTarget",
        title: "Designer",
      });

      const futureEffective = new Date();
      futureEffective.setDate(futureEffective.getDate() + 15);
      const futureEffectiveStr = futureEffective.toISOString().split("T")[0];

      const schedRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: emp._id,
          effectiveDate: futureEffectiveStr,
          changeType: "edit",
          changeData: { title: "Lead Designer" },
        });
      expect(schedRes.status).toBe(201);

      // Cancel the change
      await ownerAgent
        .delete(`/api/scheduled-changes/${schedRes.body._id}`);

      // Scrub past the original effective date: cancelled change is NOT projected
      const scrubDate = new Date();
      scrubDate.setDate(scrubDate.getDate() + 30);
      const histRes = await ownerAgent
        .get(
          `/api/scenarios/${scenarioId}/history?date=${encodeURIComponent(scrubDate.toISOString())}`,
        );

      expect(histRes.status).toBe(200);
      const projected = (histRes.body as Array<Record<string, unknown>>).find(
        (e) => String(e._id) === emp._id,
      );
      expect(projected?.title).toBe("Designer");
    });
  });

  describe("Fix #2: applyDueChanges writes AuditLog entries", () => {
    it("writes an audit log entry when a due scheduled change is applied", async () => {
      const emp = await createEmployee(ownerAgent, scenarioId, {
        name: "AuditTarget",
        title: "Engineer",
        level: "IC2",
      });

      // Record baseline audit count for this employee
      const beforeCount = await AuditLog.countDocuments({
        scenarioId,
        employeeId: emp._id,
      });

      const schedRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: emp._id,
          effectiveDate: todayIso(),
          changeType: "promotion",
          changeData: { title: "Senior Engineer", level: "IC4" },
        });
      expect(schedRes.status).toBe(201);

      const applyRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);
      expect(applyRes.status).toBe(200);
      expect(applyRes.body.applied).toContain(schedRes.body._id);

      const afterLogs = await AuditLog.find({
        scenarioId,
        employeeId: emp._id,
      }).sort({ timestamp: 1 });
      expect(afterLogs.length).toBe(beforeCount + 1);
      const newLog = afterLogs[afterLogs.length - 1];
      expect(newLog.action).toBe("update");
      expect((newLog.changes as Record<string, unknown>).title).toBe(
        "Senior Engineer",
      );
      expect((newLog.changes as Record<string, unknown>).level).toBe("IC4");
      expect((newLog.snapshot as Record<string, unknown>).title).toBe(
        "Senior Engineer",
      );
    });

    it("records a move action when the applied change modifies managerId", async () => {
      const manager = await createEmployee(ownerAgent, scenarioId, {
        name: "ManagerA",
      });
      const reportee = await createEmployee(ownerAgent, scenarioId, {
        name: "Reportee",
      });

      const schedRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: reportee._id,
          effectiveDate: todayIso(),
          changeType: "transfer",
          changeData: { managerId: manager._id },
        });
      expect(schedRes.status).toBe(201);

      const applyRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);
      expect(applyRes.status).toBe(200);

      const moveLog = await AuditLog.findOne({
        scenarioId,
        employeeId: reportee._id,
        action: "move",
      }).sort({ timestamp: -1 });
      expect(moveLog).toBeTruthy();
      expect((moveLog?.changes as Record<string, unknown>).managerId).toBe(
        manager._id,
      );
    });

    it("auto-apply middleware writes audit log entries too", async () => {
      const emp = await createEmployee(ownerAgent, scenarioId, {
        name: "AutoApplyAudit",
        title: "Coordinator",
      });

      const schedRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: emp._id,
          effectiveDate: todayIso(),
          changeType: "edit",
          changeData: { title: "Senior Coordinator" },
        });
      expect(schedRes.status).toBe(201);

      // Accessing the employees list triggers the auto-apply middleware
      const listRes = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/employees`);
      expect(listRes.status).toBe(200);

      const updateLog = await AuditLog.findOne({
        scenarioId,
        employeeId: emp._id,
        action: "update",
        "changes.title": "Senior Coordinator",
      });
      expect(updateLog).toBeTruthy();

      const scheduled = await ScheduledChange.findById(schedRes.body._id);
      expect(scheduled?.status).toBe("applied");
    });
  });
});
