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

const TEST_PREFIX = `sched_test_${Date.now()}`;
let ownerToken: string;
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
  const ownerRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds("owner"));
  ownerToken = ownerRes.body.token;

  // Create org
  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  // Create scenario
  const scenarioRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Test Scenario" });
  scenarioId = scenarioRes.body._id;

  // Create employee
  const empRes = await request(app)
    .post(`/api/scenarios/${scenarioId}/employees`)
    .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("creates a transfer scheduled change", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it("filters by status", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/scheduled-changes?status=pending`)
        .set("Authorization", `Bearer ${ownerToken}`);

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
      const res = await request(app)
        .patch(`/api/scheduled-changes/${scheduledChangeId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          effectiveDate: newDate,
          changeData: { title: "Staff Engineer", level: "IC5" },
        });

      expect(res.status).toBe(200);
      expect(res.body.changeData).toEqual({ title: "Staff Engineer", level: "IC5" });
    });

    it("rejects updating to a past date", async () => {
      const res = await request(app)
        .patch(`/api/scheduled-changes/${scheduledChangeId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ effectiveDate: pastDate(3) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Effective date cannot be in the past");
    });

    it("rejects updating a non-existent change", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/scheduled-changes/${fakeId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ changeData: { title: "Test" } });

      expect(res.status).toBe(404);
    });

    it("rejects invalid change ID", async () => {
      const res = await request(app)
        .patch(`/api/scheduled-changes/bad-id`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ changeData: { title: "Test" } });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/scheduled-changes/:id", () => {
    it("cancels a pending scheduled change", async () => {
      const res = await request(app)
        .delete(`/api/scheduled-changes/${scheduledChangeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelled");
    });

    it("rejects cancelling an already cancelled change", async () => {
      const res = await request(app)
        .delete(`/api/scheduled-changes/${scheduledChangeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Can only cancel pending scheduled changes");
    });

    it("rejects non-existent change", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`/api/scheduled-changes/${fakeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/scheduled-changes/apply-due", () => {
    let applyEmployeeId: string;
    let applyChangeId: string;

    it("applies changes with past/current effective dates", async () => {
      // Create a separate employee for this test
      const empRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${ownerToken}`)
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
      const changeRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          employeeId: applyEmployeeId,
          effectiveDate: today,
          changeType: "promotion",
          changeData: { title: "Senior Engineer", level: "IC4" },
        });
      applyChangeId = changeRes.body._id;

      // Apply due changes
      const res = await request(app)
        .post(`/api/scheduled-changes/apply-due`)
        .set("Authorization", `Bearer ${ownerToken}`);

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
      const futChangeRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/scheduled-changes`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          employeeId: applyEmployeeId,
          effectiveDate: futureDate(90),
          changeType: "edit",
          changeData: { title: "Principal Engineer" },
        });

      const res = await request(app)
        .post(`/api/scheduled-changes/apply-due`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      // The future change should NOT be in the applied list
      expect(res.body.applied).not.toContain(futChangeRes.body._id);

      // Verify employee still has the last applied title
      const empCheck = await Employee.findById(applyEmployeeId);
      expect(empCheck?.title).toBe("Senior Engineer");
    });
  });
});
