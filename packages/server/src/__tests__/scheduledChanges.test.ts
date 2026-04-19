import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import { registerAgent, type TestAgent } from "./helpers/authAgent";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import ScheduledChange from "../models/ScheduledChange";

const TEST_PREFIX = `sched_test_${Date.now()}`;
let ownerAgent: TestAgent;
let outsiderAgent: TestAgent;
let orgId: string;
let scenarioId: string;
let employeeId: string;

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: "TestPass123!",
    name: `${suffix} User`,
  };
}

/** Return a date string N days from now in ISO format */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register owner
  ownerAgent = await registerAgent(app, testCreds("owner"));

  // Register outsider (not a member of the org)
  outsiderAgent = await registerAgent(app, testCreds("outsider"));

  // Create org
  const orgRes = await ownerAgent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  // Create scenario
  const scenarioRes = await ownerAgent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Test Scenario" });
  scenarioId = scenarioRes.body._id;

  // Create employee
  const empRes = await ownerAgent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({
      name: "Jane Doe",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "San Francisco",
      employmentType: "FTE",
      status: "Active",
    });
  employeeId = empRes.body._id;
});

afterAll(async () => {
  await ScheduledChange.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Scheduled Changes API", () => {
  let scheduledChangeId: string;

  describe("POST /api/scenarios/:id/scheduled-changes", () => {
    it("creates a scheduled change with a future date", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId,
          effectiveDate: futureDate(7),
          changeType: "promotion",
          changeData: { title: "Senior Engineer", level: "IC4" },
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("_id");
      expect(res.body.employeeId).toBe(employeeId);
      expect(res.body.changeType).toBe("promotion");
      expect(res.body.status).toBe("pending");
      expect(res.body.changeData).toEqual({ title: "Senior Engineer", level: "IC4" });
      scheduledChangeId = res.body._id;
    });

    it("rejects past dates", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId,
          effectiveDate: pastDate(5),
          changeType: "edit",
          changeData: { title: "Updated Title" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Effective date cannot be in the past");
    });

    it("rejects invalid employee ID", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: "invalid-id",
          effectiveDate: futureDate(7),
          changeType: "edit",
          changeData: { title: "Test" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid employee ID");
    });

    it("rejects employee not in scenario", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: fakeId,
          effectiveDate: futureDate(7),
          changeType: "edit",
          changeData: { title: "Test" },
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Employee not found in this scenario");
    });

    it("rejects missing required fields", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("creates a transfer scheduled change", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId,
          effectiveDate: futureDate(14),
          changeType: "transfer",
          changeData: { department: "Product", location: "New York" },
        });

      expect(res.status).toBe(201);
      expect(res.body.changeType).toBe("transfer");
    });

    it("creates a departure scheduled change", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId,
          effectiveDate: futureDate(30),
          changeType: "departure",
          changeData: { status: "Backfill" },
        });

      expect(res.status).toBe(201);
      expect(res.body.changeType).toBe("departure");
    });
  });

  describe("GET /api/scenarios/:id/scheduled-changes", () => {
    it("lists all scheduled changes for a scenario", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/scheduled-changes`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it("filters by status", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/scheduled-changes?status=pending`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach((change: { status: string }) => {
        expect(change.status).toBe("pending");
      });
    });
  });

  describe("PATCH /api/scheduled-changes/:id", () => {
    it("updates a pending scheduled change", async () => {
      const newDate = futureDate(21);
      const res = await ownerAgent
        .patch(`/api/scheduled-changes/${scheduledChangeId}`)
        .send({
          effectiveDate: newDate,
          changeData: { title: "Staff Engineer", level: "IC5" },
        });

      expect(res.status).toBe(200);
      expect(res.body.changeData).toEqual({ title: "Staff Engineer", level: "IC5" });
    });

    it("rejects updating to a past date", async () => {
      const res = await ownerAgent
        .patch(`/api/scheduled-changes/${scheduledChangeId}`)
        .send({ effectiveDate: pastDate(3) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Effective date cannot be in the past");
    });

    it("rejects updating a non-existent change", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await ownerAgent
        .patch(`/api/scheduled-changes/${fakeId}`)
        .send({ changeData: { title: "Test" } });

      expect(res.status).toBe(404);
    });

    it("rejects invalid change ID", async () => {
      const res = await ownerAgent
        .patch(`/api/scheduled-changes/bad-id`)
        .send({ changeData: { title: "Test" } });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/scheduled-changes/:id", () => {
    it("cancels a pending scheduled change", async () => {
      const res = await ownerAgent
        .delete(`/api/scheduled-changes/${scheduledChangeId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelled");
    });

    it("rejects cancelling an already cancelled change", async () => {
      const res = await ownerAgent
        .delete(`/api/scheduled-changes/${scheduledChangeId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Can only cancel pending scheduled changes");
    });

    it("rejects non-existent change", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await ownerAgent
        .delete(`/api/scheduled-changes/${fakeId}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/scenarios/:id/scheduled-changes/apply-due", () => {
    let applyEmployeeId: string;
    let applyChangeId: string;

    it("applies changes with past/current effective dates", async () => {
      // Create a separate employee for this test
      const empRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/employees`)
        .send({
          name: "Apply Test",
          title: "Junior Engineer",
          department: "Engineering",
          level: "IC1",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });
      applyEmployeeId = empRes.body._id;

      // Create a change with today's date (should be applied)
      const today = new Date().toISOString().split("T")[0];
      const changeRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: applyEmployeeId,
          effectiveDate: today,
          changeType: "promotion",
          changeData: { title: "Senior Engineer", level: "IC4" },
        });
      applyChangeId = changeRes.body._id;

      // Apply due changes — now scenario-scoped
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      expect(res.body.applied).toContain(applyChangeId);

      // Verify the employee was updated
      const empCheck = await Employee.findById(applyEmployeeId);
      expect(empCheck?.title).toBe("Senior Engineer");
      expect(empCheck?.level).toBe("IC4");
    });

    it("does not apply future changes", async () => {
      // Create a change with future date
      const futChangeRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: applyEmployeeId,
          effectiveDate: futureDate(90),
          changeType: "edit",
          changeData: { title: "Principal Engineer" },
        });

      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);

      expect(res.status).toBe(200);
      // The future change should NOT be in the applied list
      expect(res.body.applied).not.toContain(futChangeRes.body._id);

      // Verify employee still has the last applied title
      const empCheck = await Employee.findById(applyEmployeeId);
      expect(empCheck?.title).toBe("Senior Engineer");
    });

    it("rejects unauthorized user (non-member)", async () => {
      const res = await outsiderAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);

      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated request", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);

      expect(res.status).toBe(401);
    });

    it("only applies changes for the specified scenario", async () => {
      // Create a second scenario with its own employee and scheduled change
      const scenario2Res = await ownerAgent
        .post(`/api/orgs/${orgId}/scenarios`)
        .send({ name: "Isolated Scenario" });
      const scenario2Id = scenario2Res.body._id;

      const emp2Res = await ownerAgent
        .post(`/api/scenarios/${scenario2Id}/employees`)
        .send({
          name: "Isolated Employee",
          title: "Analyst",
          department: "Finance",
          level: "IC2",
          location: "NYC",
          employmentType: "FTE",
          status: "Active",
        });
      const emp2Id = emp2Res.body._id;

      const today = new Date().toISOString().split("T")[0];
      await ownerAgent
        .post(`/api/scenarios/${scenario2Id}/scheduled-changes`)
        .send({
          employeeId: emp2Id,
          effectiveDate: today,
          changeType: "promotion",
          changeData: { title: "Senior Analyst" },
        });

      // Apply due changes only for the FIRST scenario
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes/apply-due`);

      expect(res.status).toBe(200);

      // Verify the second scenario's employee was NOT changed
      const emp2Check = await Employee.findById(emp2Id);
      expect(emp2Check?.title).toBe("Analyst");

      // Clean up
      await ScheduledChange.deleteMany({ scenarioId: scenario2Id });
      await Employee.deleteMany({ scenarioId: scenario2Id });
      await Scenario.deleteMany({ _id: scenario2Id });
    });
  });

  describe("Auto-apply middleware", () => {
    it("auto-applies due changes when listing employees", async () => {
      // Create a new employee
      const empRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/employees`)
        .send({
          name: "Auto Apply Test",
          title: "Intern",
          department: "Engineering",
          level: "IC0",
          location: "Remote",
          employmentType: "Intern",
          status: "Active",
        });
      const autoEmpId = empRes.body._id;

      // Create a due change (today's date)
      const today = new Date().toISOString().split("T")[0];
      const changeRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: autoEmpId,
          effectiveDate: today,
          changeType: "promotion",
          changeData: { title: "Junior Engineer", level: "IC1" },
        });

      // GET employees — should trigger auto-apply middleware
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/employees`);

      expect(res.status).toBe(200);

      // Verify employee was auto-updated
      const empCheck = await Employee.findById(autoEmpId);
      expect(empCheck?.title).toBe("Junior Engineer");
      expect(empCheck?.level).toBe("IC1");

      // Verify the scheduled change status was updated to applied
      const changeCheck = await ScheduledChange.findById(changeRes.body._id);
      expect(changeCheck?.status).toBe("applied");
    });

    it("auto-applies due changes when listing scheduled changes", async () => {
      // Create a new employee
      const empRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/employees`)
        .send({
          name: "Auto Apply SC Test",
          title: "Designer",
          department: "Design",
          level: "IC2",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });
      const autoEmpId = empRes.body._id;

      // Create a due change
      const today = new Date().toISOString().split("T")[0];
      const changeRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .send({
          employeeId: autoEmpId,
          effectiveDate: today,
          changeType: "edit",
          changeData: { title: "Senior Designer" },
        });

      // GET scheduled changes — should trigger auto-apply middleware
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/scheduled-changes`);

      expect(res.status).toBe(200);

      // Verify the change was applied
      const changeCheck = await ScheduledChange.findById(changeRes.body._id);
      expect(changeCheck?.status).toBe("applied");
    });
  });
});
