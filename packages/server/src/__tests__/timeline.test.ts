import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import ScheduledChange from "../models/ScheduledChange";
import AuditLog from "../models/AuditLog";

const TEST_PREFIX = `timeline_test_${Date.now()}`;
let ownerToken: string;
let outsiderToken: string;
let orgId: string;
let scenarioId: string;
let emptyScenarioId: string;

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: "changeme",
    name: `${suffix} User`,
  };
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function createEmployee(token: string, scenId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/scenarios/${scenId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Test Emp",
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

  const ownerRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds("owner"));
  ownerToken = ownerRes.body.token;

  const outsiderRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds("outsider"));
  outsiderToken = outsiderRes.body.token;

  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  const scenarioRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Timeline Scenario" });
  scenarioId = scenarioRes.body._id;

  const emptyRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Empty Scenario" });
  emptyScenarioId = emptyRes.body._id;
});

afterAll(async () => {
  await AuditLog.deleteMany({ scenarioId });
  await AuditLog.deleteMany({ scenarioId: emptyScenarioId });
  await ScheduledChange.deleteMany({ scenarioId });
  await ScheduledChange.deleteMany({ scenarioId: emptyScenarioId });
  await Employee.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId: emptyScenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Timeline API", () => {
  describe("Audit log writes from employee CRUD", () => {
    let emp1Id: string;

    it("creates an audit log entry when an employee is created", async () => {
      const emp = await createEmployee(ownerToken, scenarioId, { name: "Alice" });
      emp1Id = emp._id;

      const logs = await AuditLog.find({ scenarioId, employeeId: emp1Id });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe("create");
      expect((logs[0].snapshot as Record<string, unknown>).name).toBe("Alice");
    });

    it("creates an audit log entry when an employee is updated", async () => {
      const res = await request(app)
        .patch(`/api/employees/${emp1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Senior Engineer" });
      expect(res.status).toBe(200);

      const logs = await AuditLog.find({ scenarioId, employeeId: emp1Id, action: "update" });
      expect(logs.length).toBe(1);
      expect((logs[0].changes as Record<string, unknown>).title).toBe("Senior Engineer");
    });

    it("creates an audit log entry when an employee is moved", async () => {
      const manager = await createEmployee(ownerToken, scenarioId, { name: "Manager" });

      const res = await request(app)
        .patch(`/api/employees/${emp1Id}/move`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ managerId: manager._id, order: 0 });
      expect(res.status).toBe(200);

      const logs = await AuditLog.find({ scenarioId, employeeId: emp1Id, action: "move" });
      expect(logs.length).toBe(1);
      expect((logs[0].changes as Record<string, unknown>).managerId).toBe(manager._id);
    });

    it("creates audit log entries when employees are bulk-created", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees/bulk`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send([
          { name: "Bulk1", title: "T", department: "D", level: "L", location: "R", employmentType: "FTE", status: "Active" },
          { name: "Bulk2", title: "T", department: "D", level: "L", location: "R", employmentType: "FTE", status: "Active" },
        ]);
      expect(res.status).toBe(201);

      const logs = await AuditLog.find({ scenarioId, action: "bulk_create" });
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it("creates an audit log entry when an employee is deleted", async () => {
      const emp = await createEmployee(ownerToken, scenarioId, { name: "DeleteMe" });

      const res = await request(app)
        .delete(`/api/employees/${emp._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);

      const logs = await AuditLog.find({ scenarioId, employeeId: emp._id, action: "delete" });
      expect(logs.length).toBe(1);
      expect((logs[0].snapshot as Record<string, unknown>).name).toBe("DeleteMe");
    });
  });

  describe("GET /api/scenarios/:id/timeline", () => {
    it("returns events and future markers for a scenario", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("events");
      expect(res.body).toHaveProperty("futureMarkers");
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(Array.isArray(res.body.futureMarkers)).toBe(true);
      expect(res.body.events.length).toBeGreaterThan(0);
    });

    it("includes event actions (create/update/move/delete)", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const actions = res.body.events.map((e: { action: string }) => e.action);
      expect(actions).toContain("create");
      expect(actions).toContain("update");
      expect(actions).toContain("move");
      expect(actions).toContain("delete");
    });

    it("orders events by timestamp ascending", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const timestamps = res.body.events.map((e: { timestamp: string }) => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it("returns empty events for an empty scenario", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${emptyScenarioId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
      expect(res.body.futureMarkers).toEqual([]);
    });

    it("includes pending scheduled changes as future markers", async () => {
      const emp = await createEmployee(ownerToken, scenarioId, { name: "FutureTarget" });
      const schedRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          employeeId: emp._id,
          effectiveDate: futureDate(45),
          changeType: "promotion",
          changeData: { title: "Principal Engineer" },
        });
      expect(schedRes.status).toBe(201);

      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const markerIds = res.body.futureMarkers.map((m: { _id: string }) => m._id);
      expect(markerIds).toContain(schedRes.body._id);

      const marker = res.body.futureMarkers.find(
        (m: { _id: string }) => m._id === schedRes.body._id,
      );
      expect(marker.isFuture).toBe(true);
      expect(marker.changeType).toBe("promotion");
    });

    it("requires authentication", async () => {
      const res = await request(app).get(`/api/scenarios/${scenarioId}/timeline`);
      expect(res.status).toBe(401);
    });

    it("rejects non-members with 403", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/timeline`)
        .set("Authorization", `Bearer ${outsiderToken}`);
      expect(res.status).toBe(403);
    });

    it("rejects invalid scenario IDs with 400", async () => {
      const res = await request(app)
        .get(`/api/scenarios/bad-id/timeline`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/scenarios/:id/history", () => {
    let historyScenarioId: string;
    let pastDate: Date;
    let midDate: Date;
    let futureLogDate: Date;

    beforeAll(async () => {
      // Build a fresh scenario with handcrafted audit log timestamps so we can
      // deterministically test time-travel semantics.
      const scRes = await request(app)
        .post(`/api/orgs/${orgId}/scenarios`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "History Scenario" });
      historyScenarioId = scRes.body._id;

      // Create three employees
      const e1 = await createEmployee(ownerToken, historyScenarioId, { name: "Alpha" });
      const e2 = await createEmployee(ownerToken, historyScenarioId, { name: "Beta" });
      const e3 = await createEmployee(ownerToken, historyScenarioId, { name: "Gamma" });

      // Overwrite audit log timestamps for deterministic time-travel
      pastDate = new Date("2025-01-01T00:00:00Z");
      midDate = new Date("2025-06-01T00:00:00Z");
      futureLogDate = new Date("2025-12-01T00:00:00Z");

      await AuditLog.updateOne(
        { scenarioId: historyScenarioId, employeeId: e1._id, action: "create" },
        { $set: { timestamp: pastDate } },
      );
      await AuditLog.updateOne(
        { scenarioId: historyScenarioId, employeeId: e2._id, action: "create" },
        { $set: { timestamp: midDate } },
      );
      await AuditLog.updateOne(
        { scenarioId: historyScenarioId, employeeId: e3._id, action: "create" },
        { $set: { timestamp: futureLogDate } },
      );
    });

    afterAll(async () => {
      await AuditLog.deleteMany({ scenarioId: historyScenarioId });
      await Employee.deleteMany({ scenarioId: historyScenarioId });
      await Scenario.deleteMany({ _id: historyScenarioId });
    });

    it("returns current state when no date is provided", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
    });

    it("returns only employees created before or at target date", async () => {
      // After pastDate + 1 day → only Alpha should be present
      const targetDate = new Date(pastDate.getTime() + 86400000).toISOString();
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history?date=${encodeURIComponent(targetDate)}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).toContain("Alpha");
      expect(names).not.toContain("Beta");
      expect(names).not.toContain("Gamma");
    });

    it("returns two employees at mid-date (after Alpha+Beta, before Gamma)", async () => {
      const targetDate = new Date(midDate.getTime() + 86400000).toISOString();
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history?date=${encodeURIComponent(targetDate)}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).toContain("Alpha");
      expect(names).toContain("Beta");
      expect(names).not.toContain("Gamma");
    });

    it("returns all three employees at a date after all creations", async () => {
      const targetDate = new Date(futureLogDate.getTime() + 86400000).toISOString();
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history?date=${encodeURIComponent(targetDate)}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
    });

    it("returns empty array at a date before any creation", async () => {
      const targetDate = new Date("2024-01-01T00:00:00Z").toISOString();
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history?date=${encodeURIComponent(targetDate)}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("rejects invalid date format with 400", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history?date=not-a-date`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app).get(`/api/scenarios/${historyScenarioId}/history`);
      expect(res.status).toBe(401);
    });

    it("rejects non-members with 403", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${historyScenarioId}/history`)
        .set("Authorization", `Bearer ${outsiderToken}`);
      expect(res.status).toBe(403);
    });
  });
});
