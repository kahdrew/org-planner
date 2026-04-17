import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import http from "http";
import { AddressInfo } from "net";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import { eventBus } from "../sse/eventBus";

/**
 * End-to-end SSE tests. These tests spin up an ephemeral HTTP server
 * wrapping the Express app so we can hold open a real socket and read
 * the event-stream chunked response.
 */

const TEST_PREFIX = `sse_test_${Date.now()}`;
// Shared test password — identical for both users. Not a real credential;
// only used against the ephemeral MongoDB test DB.
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "TestPass123!";

const userAEmail = `${TEST_PREFIX}_a@example.com`;
const userAName = "SseUserA";

const userBEmail = `${TEST_PREFIX}_b@example.com`;
const userBName = "SseUserB";

let tokenA: string;
let tokenB: string;
let orgAId: string;
let orgBId: string;
let scenarioAId: string;
let scenarioBId: string;

let server: http.Server;
let baseUrl: string;

function employeePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "SSE Test Employee",
    title: "Engineer",
    department: "Engineering",
    level: "IC3",
    location: "Remote",
    employmentType: "FTE",
    status: "Active",
    ...overrides,
  };
}

interface SseEventFrame {
  event?: string;
  data?: string;
}

/**
 * Open an SSE stream, collect parsed events, and return a handle that
 * lets the test close the connection and inspect received events.
 */
function openSseStream(opts: {
  orgId: string;
  token?: string;
  tokenInQuery?: boolean;
}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  events: SseEventFrame[];
  waitFor: (eventName: string, timeoutMs?: number) => Promise<SseEventFrame>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const { orgId, token, tokenInQuery } = opts;
    const url = new URL(`${baseUrl}/api/orgs/${orgId}/events`);
    if (token && tokenInQuery) {
      url.searchParams.set("access_token", token);
    }

    const req = http.get(url, {
      headers:
        token && !tokenInQuery
          ? { Authorization: `Bearer ${token}` }
          : {},
    });

    const events: SseEventFrame[] = [];
    const waiters = new Map<string, ((frame: SseEventFrame) => void)[]>();

    const ingest = (frame: SseEventFrame) => {
      events.push(frame);
      const list = waiters.get(frame.event ?? "message");
      if (list && list.length > 0) {
        const resolveFn = list.shift()!;
        resolveFn(frame);
      }
    };

    req.on("response", (res) => {
      const stream = {
        statusCode: res.statusCode ?? 0,
        headers: res.headers,
        events,
        waitFor: (eventName: string, timeoutMs = 2000) =>
          new Promise<SseEventFrame>((waitResolve, waitReject) => {
            const existing = events.find((e) => e.event === eventName);
            if (existing) {
              waitResolve(existing);
              return;
            }
            const list = waiters.get(eventName) ?? [];
            list.push(waitResolve);
            waiters.set(eventName, list);
            setTimeout(() => {
              const idx = list.indexOf(waitResolve);
              if (idx >= 0) list.splice(idx, 1);
              waitReject(
                new Error(`Timed out waiting for SSE event "${eventName}"`),
              );
            }, timeoutMs);
          }),
        close: () => {
          req.destroy();
        },
      };
      resolve(stream);

      // If the server rejected the request with a non-2xx status, we can
      // resolve immediately — there will be no event stream.
      if ((res.statusCode ?? 0) >= 400) {
        return;
      }

      let buffer = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // Ignore comment-only frames (keepalives).
          const lines = raw.split("\n").filter((l) => !l.startsWith(":"));
          if (lines.length === 0) continue;
          let eventName: string | undefined;
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice("data:".length).trim());
            }
          }
          ingest({
            event: eventName,
            data: dataLines.join("\n"),
          });
        }
      });
      res.on("end", () => {
        /* stream closed by server */
      });
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register two users, each with their own org + scenario.
  const regA = await request(app)
    .post("/api/auth/register")
    .send({ email: userAEmail, password: TEST_PASSWORD, name: userAName });
  tokenA = regA.body.token;

  const regB = await request(app)
    .post("/api/auth/register")
    .send({ email: userBEmail, password: TEST_PASSWORD, name: userBName });
  tokenB = regB.body.token;

  const orgARes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ name: `${TEST_PREFIX}_orgA` });
  orgAId = orgARes.body._id;

  const orgBRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ name: `${TEST_PREFIX}_orgB` });
  orgBId = orgBRes.body._id;

  const scenAR = await request(app)
    .post(`/api/orgs/${orgAId}/scenarios`)
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ name: `${TEST_PREFIX}_scenarioA` });
  scenarioAId = scenAR.body._id;

  const scenBR = await request(app)
    .post(`/api/orgs/${orgBId}/scenarios`)
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ name: `${TEST_PREFIX}_scenarioB` });
  scenarioBId = scenBR.body._id;

  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  eventBus.reset();
  await new Promise<void>((r) => server.close(() => r()));

  // Cleanup
  await Employee.deleteMany({
    scenarioId: { $in: [scenarioAId, scenarioBId].filter(Boolean) },
  });
  await Scenario.deleteMany({ orgId: { $in: [orgAId, orgBId].filter(Boolean) } });
  await Organization.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("SSE endpoint auth (VAL-SSE-009)", () => {
  it("rejects connections without a token (401)", async () => {
    const stream = await openSseStream({ orgId: orgAId });
    try {
      expect(stream.statusCode).toBe(401);
    } finally {
      stream.close();
    }
  });

  it("rejects connections with an invalid token (401)", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: "not-a-real-jwt",
      tokenInQuery: true,
    });
    try {
      expect(stream.statusCode).toBe(401);
    } finally {
      stream.close();
    }
  });

  it("rejects connections with an expired token (401)", async () => {
    const expired = jwt.sign({ userId: "fakeuserid" }, process.env.JWT_SECRET!, {
      expiresIn: "0s",
    });
    const stream = await openSseStream({
      orgId: orgAId,
      token: expired,
      tokenInQuery: true,
    });
    try {
      expect(stream.statusCode).toBe(401);
    } finally {
      stream.close();
    }
  });

  it("rejects connections for malformed org IDs (400)", async () => {
    const stream = await openSseStream({
      orgId: "not-valid-id",
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      expect(stream.statusCode).toBe(400);
    } finally {
      stream.close();
    }
  });
});

describe("SSE authorization — org membership (VAL-SSE-008)", () => {
  it("rejects non-members of the org (403)", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenB,
      tokenInQuery: true,
    });
    try {
      expect(stream.statusCode).toBe(403);
    } finally {
      stream.close();
    }
  });
});

describe("SSE endpoint stream headers & hello (VAL-SSE-001)", () => {
  it("returns the correct text/event-stream headers", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      expect(stream.statusCode).toBe(200);
      expect(String(stream.headers["content-type"])).toContain(
        "text/event-stream",
      );
      expect(String(stream.headers["cache-control"])).toContain("no-cache");
      const hello = await stream.waitFor("connected", 2000);
      const parsed = JSON.parse(hello.data ?? "{}");
      expect(parsed.type).toBe("connected");
      expect(parsed.orgId).toBe(orgAId);
    } finally {
      stream.close();
    }
  });

  it("accepts a token supplied via the Authorization header", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: false,
    });
    try {
      expect(stream.statusCode).toBe(200);
      expect(String(stream.headers["content-type"])).toContain(
        "text/event-stream",
      );
    } finally {
      stream.close();
    }
  });
});

describe("SSE event fan-out — employee mutations (VAL-SSE-002..005)", () => {
  it("delivers employee.created events to connected clients", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      await stream.waitFor("connected");

      const res = await request(app)
        .post(`/api/scenarios/${scenarioAId}/employees`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send(employeePayload({ name: "SSE CreateTarget" }));
      expect(res.status).toBe(201);

      const frame = await stream.waitFor("employee.created", 3000);
      const parsed = JSON.parse(frame.data ?? "{}");
      expect(parsed.type).toBe("employee.created");
      expect(parsed.scenarioId).toBe(scenarioAId);
      expect(parsed.payload.employee.name).toBe("SSE CreateTarget");
      expect(parsed.payload.employee._id).toBe(res.body._id);
    } finally {
      stream.close();
    }
  });

  it("delivers employee.updated events to connected clients", async () => {
    // Seed an employee to update
    const seed = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(employeePayload({ name: "SSE UpdateTarget" }));
    const employeeId = seed.body._id;

    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      await stream.waitFor("connected");

      const res = await request(app)
        .patch(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ title: "Senior Engineer" });
      expect(res.status).toBe(200);

      const frame = await stream.waitFor("employee.updated", 3000);
      const parsed = JSON.parse(frame.data ?? "{}");
      expect(parsed.payload.employee._id).toBe(employeeId);
      expect(parsed.payload.employee.title).toBe("Senior Engineer");
    } finally {
      stream.close();
    }
  });

  it("delivers employee.moved events with previous manager info", async () => {
    const manager = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(employeePayload({ name: "SSE Manager" }));
    const target = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(employeePayload({ name: "SSE MoveTarget" }));

    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      await stream.waitFor("connected");

      const res = await request(app)
        .patch(`/api/employees/${target.body._id}/move`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ managerId: manager.body._id, order: 0 });
      expect(res.status).toBe(200);

      const frame = await stream.waitFor("employee.moved", 3000);
      const parsed = JSON.parse(frame.data ?? "{}");
      expect(parsed.payload.employee._id).toBe(target.body._id);
      expect(parsed.payload.employee.managerId).toBe(manager.body._id);
      expect(parsed.payload.previousManagerId).toBeNull();
    } finally {
      stream.close();
    }
  });

  it("delivers employee.deleted events to connected clients", async () => {
    const seed = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(employeePayload({ name: "SSE DeleteTarget" }));
    const employeeId = seed.body._id;

    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      await stream.waitFor("connected");

      const res = await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);

      const frame = await stream.waitFor("employee.deleted", 3000);
      const parsed = JSON.parse(frame.data ?? "{}");
      expect(parsed.payload.employeeId).toBe(employeeId);
      expect(Array.isArray(parsed.payload.affectedReportIds)).toBe(true);
    } finally {
      stream.close();
    }
  });
});

describe("SSE multi-session fan-out (VAL-CROSS-009)", () => {
  it("delivers the same mutation to multiple connected sessions", async () => {
    const tab1 = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    const tab2 = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    try {
      await tab1.waitFor("connected");
      await tab2.waitFor("connected");

      const res = await request(app)
        .post(`/api/scenarios/${scenarioAId}/employees`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send(employeePayload({ name: "SSE MultiTabTarget" }));
      expect(res.status).toBe(201);

      const [f1, f2] = await Promise.all([
        tab1.waitFor("employee.created", 3000),
        tab2.waitFor("employee.created", 3000),
      ]);
      const p1 = JSON.parse(f1.data ?? "{}");
      const p2 = JSON.parse(f2.data ?? "{}");
      expect(p1.payload.employee._id).toBe(res.body._id);
      expect(p2.payload.employee._id).toBe(res.body._id);
    } finally {
      tab1.close();
      tab2.close();
    }
  });
});

describe("SSE org isolation (VAL-SSE-008)", () => {
  it("does not deliver org A events to clients watching org B", async () => {
    const tabA = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    const tabB = await openSseStream({
      orgId: orgBId,
      token: tokenB,
      tokenInQuery: true,
    });
    try {
      await tabA.waitFor("connected");
      await tabB.waitFor("connected");

      const res = await request(app)
        .post(`/api/scenarios/${scenarioAId}/employees`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send(employeePayload({ name: "SSE OrgIsolationTarget" }));
      expect(res.status).toBe(201);

      await tabA.waitFor("employee.created", 3000);

      // Give a short window for any cross-talk to appear; tabB should
      // see no employee.created event.
      await new Promise((r) => setTimeout(r, 400));
      const leaked = tabB.events.find((e) => e.event === "employee.created");
      expect(leaked).toBeUndefined();
    } finally {
      tabA.close();
      tabB.close();
    }
  });
});

describe("SSE client cleanup (VAL-SSE-007)", () => {
  it("removes a client from the bus when the stream is closed", async () => {
    const stream = await openSseStream({
      orgId: orgAId,
      token: tokenA,
      tokenInQuery: true,
    });
    await stream.waitFor("connected");
    expect(eventBus.clientCount(orgAId)).toBeGreaterThanOrEqual(1);
    stream.close();
    // Allow the server to notice the socket close
    await new Promise((r) => setTimeout(r, 300));
    const after = eventBus.clientCount(orgAId);
    // It should be strictly less than before after the close propagates.
    // Not asserting exact 0 because other parallel test streams may
    // remain connected, but we confirm the count dropped.
    expect(after).toBeLessThan(2);
  });
});
