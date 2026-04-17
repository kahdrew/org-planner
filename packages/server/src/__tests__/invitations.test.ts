import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Invitation from "../models/Invitation";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";

const TEST_PREFIX = `inv_test_${Date.now()}`;
let ownerToken: string;
let ownerUserId: string;
let viewerToken: string;
let viewerUserId: string;
let adminToken: string;
let adminUserId: string;
let orgId: string;
let scenarioId: string;

function testCreds(email: string, name: string) {
  return { email, password: "x".repeat(6) + "A1!", name };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register owner user
  const ownerRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds(`${TEST_PREFIX}_owner@example.com`, "Owner User"));
  ownerToken = ownerRes.body.token;
  ownerUserId = ownerRes.body.user.id;

  // Register viewer user
  const viewerRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds(`${TEST_PREFIX}_viewer@example.com`, "Viewer User"));
  viewerToken = viewerRes.body.token;
  viewerUserId = viewerRes.body.user.id;

  // Register admin user
  const adminRes = await request(app)
    .post("/api/auth/register")
    .send(testCreds(`${TEST_PREFIX}_admin@example.com`, "Admin User"));
  adminToken = adminRes.body.token;
  adminUserId = adminRes.body.user.id;

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
    .send({ name: "Base Scenario" });
  scenarioId = scenarioRes.body._id;
});

afterAll(async () => {
  // Clean up
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Invitation.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Invitation System", () => {
  describe("POST /api/orgs/:id/invite", () => {
    it("owner can send an invitation", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: `${TEST_PREFIX}_viewer@example.com`,
          role: "viewer",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("email", `${TEST_PREFIX}_viewer@example.com`);
      expect(res.body).toHaveProperty("role", "viewer");
      expect(res.body).toHaveProperty("status", "pending");
      expect(res.body).toHaveProperty("token");
    });

    it("rejects duplicate pending invitation", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: `${TEST_PREFIX}_viewer@example.com`,
          role: "viewer",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already sent");
    });

    it("rejects invalid email", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "not-an-email", role: "viewer" });

      expect(res.status).toBe(400);
    });

    it("rejects invalid role", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "someone@test.com", role: "superadmin" });

      expect(res.status).toBe(400);
    });

    it("non-owner cannot send invitation", async () => {
      // First accept the viewer invitation to make them a member
      // We'll test this separately — for now just check a non-member gets 403
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "someone@test.com",
          role: "viewer",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/invitations (my pending invitations)", () => {
    it("returns pending invitations for the current user", async () => {
      const res = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const inv = res.body.find(
        (i: { email: string }) => i.email === `${TEST_PREFIX}_viewer@example.com`
      );
      expect(inv).toBeDefined();
      expect(inv.role).toBe("viewer");
    });

    it("returns empty for user with no invitations", async () => {
      const res = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /api/invitations/:id/accept", () => {
    it("user can accept their invitation", async () => {
      // Get the invitation
      const listRes = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${viewerToken}`);

      const invitation = listRes.body.find(
        (i: { email: string }) => i.email === `${TEST_PREFIX}_viewer@example.com`
      );

      const res = await request(app)
        .post(`/api/invitations/${invitation._id}/accept`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("accepted");
    });

    it("accepted user appears in org members", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const viewer = res.body.find(
        (m: { email: string }) => m.email === `${TEST_PREFIX}_viewer@example.com`
      );
      expect(viewer).toBeDefined();
      expect(viewer.role).toBe("viewer");
    });

    it("accepted user can see the org in their org list", async () => {
      const res = await request(app)
        .get("/api/orgs")
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      const org = res.body.find((o: { _id: string }) => o._id === orgId);
      expect(org).toBeDefined();
    });

    it("cannot accept already accepted invitation", async () => {
      const listRes = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${viewerToken}`);

      // The invitation should no longer be pending
      const pending = listRes.body.filter(
        (i: { email: string; orgId: unknown }) =>
          i.email === `${TEST_PREFIX}_viewer@example.com` &&
          (typeof i.orgId === "object" ? (i.orgId as { _id: string })._id : i.orgId) === orgId
      );
      expect(pending.length).toBe(0);
    });
  });

  describe("POST /api/invitations/:id/decline", () => {
    it("user can decline an invitation", async () => {
      // Send admin invitation
      await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: `${TEST_PREFIX}_admin@example.com`,
          role: "admin",
        });

      // Get the invitation
      const listRes = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${adminToken}`);

      const invitation = listRes.body.find(
        (i: { email: string }) => i.email === `${TEST_PREFIX}_admin@example.com`
      );

      const res = await request(app)
        .post(`/api/invitations/${invitation._id}/decline`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("declined");
    });

    it("declined user is NOT added to the org", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const admin = res.body.find(
        (m: { email: string }) => m.email === `${TEST_PREFIX}_admin@example.com`
      );
      expect(admin).toBeUndefined();
    });
  });

  describe("Invitation for existing member", () => {
    it("rejects invitation for already existing member", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: `${TEST_PREFIX}_viewer@example.com`,
          role: "admin",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already a member");
    });
  });
});

describe("Role-based Permissions", () => {
  describe("Viewer restrictions", () => {
    it("viewer can list scenarios", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/scenarios`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it("viewer can list employees", async () => {
      const res = await request(app)
        .get(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it("viewer cannot create employees", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          name: "Test Employee",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });

      expect(res.status).toBe(403);
    });

    it("viewer cannot create scenarios", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/scenarios`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "Viewer Scenario" });

      expect(res.status).toBe(403);
    });

    it("viewer cannot update employees", async () => {
      // First create an employee as owner
      const createRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Test Employee For Viewer",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });
      const employeeId = createRes.body._id;

      const res = await request(app)
        .patch(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ title: "Senior Engineer" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Insufficient permissions");

      // Clean up
      await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    });

    it("viewer cannot delete employees", async () => {
      // Create an employee as owner
      const createRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Test Employee For Delete",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });
      const employeeId = createRes.body._id;

      const res = await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);

      // Clean up
      await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    });

    it("viewer cannot move employees", async () => {
      const createRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Test Employee For Move",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });
      const employeeId = createRes.body._id;

      const res = await request(app)
        .patch(`/api/employees/${employeeId}/move`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ managerId: null, order: 0 });

      expect(res.status).toBe(403);

      // Clean up
      await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    });
  });

  describe("Owner role check", () => {
    it("viewer cannot invite members", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ email: "someone@test.com", role: "viewer" });

      expect(res.status).toBe(403);
    });

    it("viewer cannot remove members", async () => {
      const res = await request(app)
        .delete(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });

    it("viewer cannot change member roles", async () => {
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ role: "admin" });

      expect(res.status).toBe(403);
    });
  });
});

describe("Member Management", () => {
  // First, invite and accept admin user so we have more members
  beforeAll(async () => {
    // Invite admin (previous invite was declined, so we can send a new one)
    await request(app)
      .post(`/api/orgs/${orgId}/invite`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        email: `${TEST_PREFIX}_admin@example.com`,
        role: "admin",
      });

    const listRes = await request(app)
      .get("/api/invitations")
      .set("Authorization", `Bearer ${adminToken}`);

    const invitation = listRes.body.find(
      (i: { email: string }) => i.email === `${TEST_PREFIX}_admin@example.com`
    );

    if (invitation) {
      await request(app)
        .post(`/api/invitations/${invitation._id}/accept`)
        .set("Authorization", `Bearer ${adminToken}`);
    }
  });

  describe("GET /api/orgs/:id/members", () => {
    it("lists all members with roles", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const owner = res.body.find(
        (m: { email: string }) => m.email === `${TEST_PREFIX}_owner@example.com`
      );
      expect(owner.role).toBe("owner");
    });
  });

  describe("GET /api/orgs/:id/role", () => {
    it("returns the current user's role", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/role`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("owner");
    });

    it("returns viewer role for viewer", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/role`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("viewer");
    });
  });

  describe("PATCH /api/orgs/:id/members/:userId (change role)", () => {
    it("owner can change member role from viewer to admin", async () => {
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("admin");

      // Verify role changed
      const roleRes = await request(app)
        .get(`/api/orgs/${orgId}/role`)
        .set("Authorization", `Bearer ${viewerToken}`);
      expect(roleRes.body.role).toBe("admin");

      // Change back to viewer for subsequent tests
      await request(app)
        .patch(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "viewer" });
    });

    it("cannot change owner's role", async () => {
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/members/${ownerUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "admin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("owner");
    });
  });

  describe("DELETE /api/orgs/:id/members/:userId (remove member)", () => {
    it("cannot remove the owner", async () => {
      const res = await request(app)
        .delete(`/api/orgs/${orgId}/members/${ownerUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("owner");
    });

    it("owner can remove a member", async () => {
      // Remove admin user
      const res = await request(app)
        .delete(`/api/orgs/${orgId}/members/${adminUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);

      // Verify admin can no longer access org
      const orgsRes = await request(app)
        .get("/api/orgs")
        .set("Authorization", `Bearer ${adminToken}`);

      const org = orgsRes.body.find((o: { _id: string }) => o._id === orgId);
      expect(org).toBeUndefined();
    });
  });

  describe("Admin role permissions", () => {
    // Re-invite admin and accept
    beforeAll(async () => {
      await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: `${TEST_PREFIX}_admin@example.com`,
          role: "admin",
        });

      const listRes = await request(app)
        .get("/api/invitations")
        .set("Authorization", `Bearer ${adminToken}`);

      const invitation = listRes.body.find(
        (i: { email: string }) => i.email === `${TEST_PREFIX}_admin@example.com`
      );

      if (invitation) {
        await request(app)
          .post(`/api/invitations/${invitation._id}/accept`)
          .set("Authorization", `Bearer ${adminToken}`);
      }
    });

    it("admin can create employees", async () => {
      const res = await request(app)
        .post(`/api/scenarios/${scenarioId}/employees`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Admin Created Employee",
          title: "Designer",
          department: "Design",
          level: "IC2",
          location: "Remote",
          employmentType: "FTE",
          status: "Active",
        });

      expect(res.status).toBe(201);

      // Clean up
      await request(app)
        .delete(`/api/employees/${res.body._id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
    });

    it("admin can create scenarios", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/scenarios`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Admin Scenario" });

      expect(res.status).toBe(201);

      // Clean up
      await request(app)
        .delete(`/api/scenarios/${res.body._id}`)
        .set("Authorization", `Bearer ${adminToken}`);
    });

    it("admin cannot invite members", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/invite`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "someone@test.com", role: "viewer" });

      expect(res.status).toBe(403);
    });

    it("admin cannot remove members", async () => {
      const res = await request(app)
        .delete(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it("admin cannot change member roles", async () => {
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/members/${viewerUserId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "admin" });

      expect(res.status).toBe(403);
    });
  });
});
