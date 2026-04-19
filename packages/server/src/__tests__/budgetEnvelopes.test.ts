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
import BudgetEnvelope from "../models/BudgetEnvelope";

const TEST_PREFIX = `budget_test_${Date.now()}`;
// Non-secret placeholder used only in this isolated integration test.
const TEST_PASSWORD = ["budget", "tester", "pwd"].join("-") + Date.now();

let ownerAgent: TestAgent;
let viewerAgent: TestAgent;
let outsiderAgent: TestAgent;
let orgId: string;
let scenarioId: string;

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: TEST_PASSWORD,
    name: `${suffix} User`,
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register users
  ownerAgent = await registerAgent(app, testCreds("owner"));
  viewerAgent = await registerAgent(app, testCreds("viewer"));
  outsiderAgent = await registerAgent(app, testCreds("outsider"));

  // Create org
  const orgRes = await ownerAgent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  // Invite viewer to the org as 'viewer'
  const inviteRes = await ownerAgent
    .post(`/api/orgs/${orgId}/invite`)
    .send({ email: testCreds("viewer").email, role: "viewer" });
  const invitationId = inviteRes.body._id;

  await viewerAgent
    .post(`/api/invitations/${invitationId}/accept`);

  // Create scenario
  const scenarioRes = await ownerAgent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Budget Scenario" });
  scenarioId = scenarioRes.body._id;

  // Seed a few employees across departments
  const empsToCreate = [
    {
      name: "Alice",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "SF",
      employmentType: "FTE",
      status: "Active",
      salary: 150000,
      equity: 30000,
    },
    {
      name: "Bob",
      title: "Senior Engineer",
      department: "Engineering",
      level: "IC4",
      location: "SF",
      employmentType: "FTE",
      status: "Active",
      salary: 200000,
      equity: 50000,
    },
    {
      name: "Carol",
      title: "Sales Rep",
      department: "Sales",
      level: "IC2",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
      salary: 100000,
      equity: 10000,
    },
  ];

  for (const emp of empsToCreate) {
    await ownerAgent
      .post(`/api/scenarios/${scenarioId}/employees`)
      .send(emp);
  }
});

afterAll(async () => {
  await BudgetEnvelope.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Budget Envelope API", () => {
  let engineeringBudgetId: string;

  describe("POST /api/scenarios/:id/budgets", () => {
    it("owner can create an envelope for a department", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Engineering",
          totalBudget: 500000,
          headcountCap: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("_id");
      expect(res.body.department).toBe("Engineering");
      expect(res.body.totalBudget).toBe(500000);
      expect(res.body.headcountCap).toBe(5);
      expect(res.body.scenarioId).toBe(scenarioId);
      expect(res.body.orgId).toBe(orgId);
      engineeringBudgetId = res.body._id;
    });

    it("rejects duplicate (scenario, department) envelope", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Engineering",
          totalBudget: 999999,
          headcountCap: 10,
        });
      expect(res.status).toBe(409);
    });

    it("rejects negative totalBudget", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Marketing",
          totalBudget: -1,
          headcountCap: 2,
        });
      expect(res.status).toBe(400);
    });

    it("rejects empty department", async () => {
      const res = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "   ",
          totalBudget: 100000,
          headcountCap: 2,
        });
      expect(res.status).toBe(400);
    });

    it("viewer cannot create an envelope (403)", async () => {
      const res = await viewerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Sales",
          totalBudget: 300000,
          headcountCap: 3,
        });
      expect(res.status).toBe(403);
    });

    it("outsider cannot create an envelope (403)", async () => {
      const res = await outsiderAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Sales",
          totalBudget: 300000,
          headcountCap: 3,
        });
      expect(res.status).toBe(403);
    });

    it("unauthenticated request returns 401", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({ department: "X", totalBudget: 1, headcountCap: 1 });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/scenarios/:id/budgets", () => {
    it("owner can list envelopes", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("viewer can list envelopes (read-only)", async () => {
      const res = await viewerAgent
        .get(`/api/scenarios/${scenarioId}/budgets`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("outsider cannot list envelopes (403)", async () => {
      const res = await outsiderAgent
        .get(`/api/scenarios/${scenarioId}/budgets`);
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/scenarios/:id/budgets/:budgetId", () => {
    it("owner can update an envelope", async () => {
      const res = await ownerAgent
        .patch(`/api/scenarios/${scenarioId}/budgets/${engineeringBudgetId}`)
        .send({ totalBudget: 750000, headcountCap: 8 });
      expect(res.status).toBe(200);
      expect(res.body.totalBudget).toBe(750000);
      expect(res.body.headcountCap).toBe(8);
    });

    it("returns 404 for non-existent envelope", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await ownerAgent
        .patch(`/api/scenarios/${scenarioId}/budgets/${fakeId}`)
        .send({ totalBudget: 1 });
      expect(res.status).toBe(404);
    });

    it("viewer cannot update an envelope (403)", async () => {
      const res = await viewerAgent
        .patch(`/api/scenarios/${scenarioId}/budgets/${engineeringBudgetId}`)
        .send({ totalBudget: 100 });
      expect(res.status).toBe(403);
    });

    it("rejects invalid updates", async () => {
      const res = await ownerAgent
        .patch(`/api/scenarios/${scenarioId}/budgets/${engineeringBudgetId}`)
        .send({ totalBudget: -5 });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/scenarios/:id/budgets/summary", () => {
    it("returns per-department summary with actuals and utilization", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("departments");
      expect(res.body).toHaveProperty("totals");

      const eng = res.body.departments.find(
        (d: { department: string }) => d.department === "Engineering",
      );
      expect(eng).toBeDefined();
      expect(eng.totalBudget).toBe(750000);
      expect(eng.headcountCap).toBe(8);
      // Alice ($150k+$30k) + Bob ($200k+$50k) = $430k
      expect(eng.actualSpend).toBe(430000);
      expect(eng.actualHeadcount).toBe(2);
      expect(eng.remainingBudget).toBe(320000);
      expect(eng.remainingHeadcount).toBe(6);
      // ~57.3% utilization → under
      expect(eng.budgetStatus).toBe("under");
    });

    it("includes unbudgeted departments with null envelope values", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      const sales = res.body.departments.find(
        (d: { department: string }) => d.department === "Sales",
      );
      expect(sales).toBeDefined();
      expect(sales.totalBudget).toBeNull();
      expect(sales.headcountCap).toBeNull();
      expect(sales.actualSpend).toBe(110000);
      expect(sales.actualHeadcount).toBe(1);
      expect(sales.budgetStatus).toBeNull();
    });

    it("classifies warning when actual spend >= 80% of budget", async () => {
      // Create envelope for Sales with a low budget → >80% utilization
      const sRes = await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Sales",
          totalBudget: 120000, // 110k/120k = ~91.6%
          headcountCap: 2,
        });
      expect(sRes.status).toBe(201);

      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      const sales = res.body.departments.find(
        (d: { department: string }) => d.department === "Sales",
      );
      expect(sales.budgetStatus).toBe("warning");
    });

    it("classifies exceeded when actual spend > budget", async () => {
      // Add another envelope 'Marketing' with tiny budget but no employees
      // plus an employee to trip the alert
      await ownerAgent
        .post(`/api/scenarios/${scenarioId}/employees`)
        .send({
          name: "Max Marketer",
          title: "CMO",
          department: "Marketing",
          level: "E3",
          location: "SF",
          employmentType: "FTE",
          status: "Active",
          salary: 300000,
          equity: 100000,
        });

      await ownerAgent
        .post(`/api/scenarios/${scenarioId}/budgets`)
        .send({
          department: "Marketing",
          totalBudget: 100000,
          headcountCap: 2,
        });

      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      const mkt = res.body.departments.find(
        (d: { department: string }) => d.department === "Marketing",
      );
      expect(mkt.budgetStatus).toBe("exceeded");
      expect(mkt.remainingBudget).toBeLessThan(0);
    });

    it("includes aggregated totals across all envelopes", async () => {
      const res = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      expect(res.body.totals.totalBudget).toBe(750000 + 120000 + 100000);
      expect(res.body.totals.actualSpend).toBeGreaterThan(0);
      expect(typeof res.body.totals.utilizationPct).toBe("number");
    });

    it("viewer can access summary", async () => {
      const res = await viewerAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      expect(res.status).toBe(200);
    });

    it("outsider cannot access summary (403)", async () => {
      const res = await outsiderAgent
        .get(`/api/scenarios/${scenarioId}/budgets/summary`);
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/scenarios/:id/budgets/:budgetId", () => {
    it("viewer cannot delete an envelope (403)", async () => {
      const res = await viewerAgent
        .delete(`/api/scenarios/${scenarioId}/budgets/${engineeringBudgetId}`);
      expect(res.status).toBe(403);
    });

    it("owner can delete an envelope", async () => {
      const res = await ownerAgent
        .delete(`/api/scenarios/${scenarioId}/budgets/${engineeringBudgetId}`);
      expect(res.status).toBe(200);

      // Verify it's gone
      const listRes = await ownerAgent
        .get(`/api/scenarios/${scenarioId}/budgets`);
      expect(
        listRes.body.find(
          (b: { _id: string }) => b._id === engineeringBudgetId,
        ),
      ).toBeUndefined();
    });

    it("returns 404 when deleting non-existent envelope", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await ownerAgent
        .delete(`/api/scenarios/${scenarioId}/budgets/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });
});
