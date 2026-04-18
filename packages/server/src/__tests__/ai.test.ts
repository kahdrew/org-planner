import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Mock the Anthropic SDK BEFORE importing the controller so that every
 * `createAnthropicClient()` call returns our controllable fake. This lets
 * us exercise the full HTTP path (auth, authz, prompt construction,
 * streaming, error handling) without ever making a real API call.
 */
const messagesStreamMock = vi.fn();

vi.mock("../ai/anthropicClient", async () => {
  const actual =
    await vi.importActual<typeof import("../ai/anthropicClient")>(
      "../ai/anthropicClient",
    );
  return {
    ...actual,
    createAnthropicClient: () => ({
      messages: {
        stream: messagesStreamMock,
      },
    }),
  };
});

import http from "http";
import { AddressInfo } from "net";
import request from "supertest";
import mongoose from "mongoose";

import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import {
  buildEmployeeContext,
  buildSystemPrompt,
  summarizeDepartments,
} from "../ai/orgContext";

const TEST_PREFIX = `ai_test_${Date.now()}`;
// Test-only credential against the ephemeral Atlas test DB. Sourced from
// env so it never needs to live in version control; falls back to a
// locally-generated value otherwise.
const TEST_PASSWORD =
  process.env.TEST_PASSWORD ?? `aiTest-${Date.now()}-pw`;

const userAEmail = `${TEST_PREFIX}_a@example.com`;
const userBEmail = `${TEST_PREFIX}_b@example.com`;

let tokenA: string;
let tokenB: string;
let orgAId: string;
let orgBId: string;
let scenarioAId: string;
let scenarioBId: string;

let server: http.Server;

function employeePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Ada Engineer",
    title: "Staff Engineer",
    department: "Engineering",
    level: "IC5",
    location: "Remote",
    employmentType: "FTE",
    status: "Active",
    salary: 200_000,
    ...overrides,
  };
}

/**
 * Build an async iterable that mimics Anthropic's stream event shape.
 * We feed a small number of `content_block_delta` events followed by a
 * `message_stop`. The real SDK emits many other event types; the
 * controller only cares about text deltas so that's what we exercise.
 */
function fakeStreamFromChunks(chunks: string[]) {
  const events = [
    { type: "message_start" },
    { type: "content_block_start", index: 0 },
    ...chunks.map((t) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: t },
    })),
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ];
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= events.length) return { value: undefined, done: true };
          return { value: events[i++], done: false };
        },
      };
    },
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Two users, each with their own org + scenario, so we can exercise
  // cross-org isolation (403 for non-member).
  const regA = await request(app)
    .post("/api/auth/register")
    .send({ email: userAEmail, password: TEST_PASSWORD, name: "AiUserA" });
  tokenA = regA.body.token;

  const regB = await request(app)
    .post("/api/auth/register")
    .send({ email: userBEmail, password: TEST_PASSWORD, name: "AiUserB" });
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

  const scenARes = await request(app)
    .post(`/api/orgs/${orgAId}/scenarios`)
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ name: `${TEST_PREFIX}_scenA` });
  scenarioAId = scenARes.body._id;

  const scenBRes = await request(app)
    .post(`/api/orgs/${orgBId}/scenarios`)
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ name: `${TEST_PREFIX}_scenB` });
  scenarioBId = scenBRes.body._id;

  // Seed scenario A with a tiny org so the context block is non-trivial.
  await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${tokenA}`)
    .send(employeePayload({ name: "Alice Manager", title: "Engineering Manager" }));
  await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${tokenA}`)
    .send(employeePayload({ name: "Bob Report", department: "Engineering", salary: 150_000 }));

  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  // Dynamic port reserved; unused for these tests but kept so tests can
  // open direct sockets if needed in the future.
  void (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await Employee.deleteMany({
    scenarioId: { $in: [scenarioAId, scenarioBId].filter(Boolean) },
  });
  await Scenario.deleteMany({ orgId: { $in: [orgAId, orgBId].filter(Boolean) } });
  await Organization.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

beforeEach(() => {
  messagesStreamMock.mockReset();
  // Default to a valid-looking API key so most tests exercise the happy path.
  process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";
});

describe("POST /api/scenarios/:id/ai/query — auth & validation (VAL-AI-010)", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .send({ query: "How many employees?" });
    expect(res.status).toBe(401);
    expect(messagesStreamMock).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens with 401", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", "Bearer nope")
      .send({ query: "test" });
    expect(res.status).toBe(401);
  });

  it("rejects malformed scenario IDs with 400", async () => {
    const res = await request(app)
      .post("/api/scenarios/not-a-valid-id/ai/query")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "test" });
    expect(res.status).toBe(400);
  });

  it("rejects cross-org access with 403", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ query: "test" });
    expect(res.status).toBe(403);
    expect(messagesStreamMock).not.toHaveBeenCalled();
  });

  it("rejects missing query field with 400", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects empty query string with 400", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/scenarios/:id/ai/query — missing API key (VAL-AI-007)", () => {
  it("returns 503 with setup instructions when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "How many employees are in Engineering?" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      code: "missing_api_key",
    });
    expect(typeof res.body.setupInstructions).toBe("string");
    expect(res.body.setupInstructions).toMatch(/ANTHROPIC_API_KEY/);
    expect(messagesStreamMock).not.toHaveBeenCalled();
  });

  it("treats the placeholder value as unconfigured (503)", async () => {
    process.env.ANTHROPIC_API_KEY = "placeholder-key-for-development";
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "test" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("missing_api_key");
  });
});

describe("POST /api/scenarios/:id/ai/query — streaming (VAL-AI-002, VAL-AI-003)", () => {
  it("streams content deltas as SSE chunk events then a done event", async () => {
    messagesStreamMock.mockImplementation(() =>
      Promise.resolve(
        fakeStreamFromChunks(["Hello ", "world", "."]),
      ),
    );

    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "Summarize the org." });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/event-stream");

    const body = res.text;
    // Should contain three chunk events in order.
    const chunkFrames = body
      .split("\n\n")
      .filter((f) => f.includes("event: chunk"));
    expect(chunkFrames.length).toBe(3);
    expect(chunkFrames[0]).toContain("Hello ");
    expect(chunkFrames[1]).toContain("world");
    expect(chunkFrames[2]).toContain(".");

    // Should end with a done frame.
    expect(body).toContain("event: done");
  });

  it("passes scenario context (system prompt includes employees) to the SDK", async () => {
    messagesStreamMock.mockImplementation(() =>
      Promise.resolve(fakeStreamFromChunks(["ok"])),
    );

    await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "Who is Alice?" });

    expect(messagesStreamMock).toHaveBeenCalledTimes(1);
    const [params] = messagesStreamMock.mock.calls[0];
    expect(params).toBeDefined();
    expect(typeof params.system).toBe("string");
    // System prompt should mention both seeded employees.
    expect(params.system).toContain("Alice Manager");
    expect(params.system).toContain("Bob Report");
    expect(params.system).toContain("Engineering");
    // And it must state the read-only constraint.
    expect(params.system).toMatch(/read[-\s]only/i);
    // The user message should be the latest query.
    const last = params.messages[params.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("Who is Alice?");
  });

  it("forwards history turns to the SDK (VAL-AI-009)", async () => {
    messagesStreamMock.mockImplementation(() =>
      Promise.resolve(fakeStreamFromChunks(["ok"])),
    );

    await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        query: "What about Sales?",
        history: [
          { role: "user", content: "How many in Engineering?" },
          { role: "assistant", content: "There are 2 in Engineering." },
        ],
      });

    expect(messagesStreamMock).toHaveBeenCalledTimes(1);
    const [params] = messagesStreamMock.mock.calls[0];
    expect(params.messages).toHaveLength(3);
    expect(params.messages[0]).toMatchObject({ role: "user" });
    expect(params.messages[1]).toMatchObject({ role: "assistant" });
    expect(params.messages[2]).toMatchObject({ role: "user", content: "What about Sales?" });
  });
});

describe("POST /api/scenarios/:id/ai/query — error classification (VAL-AI-007)", () => {
  it("emits a rate_limited error frame on 429 from upstream", async () => {
    messagesStreamMock.mockImplementation(() => {
      const err = Object.assign(new Error("Too many requests"), {
        status: 429,
      });
      return Promise.reject(err);
    });

    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "test" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toMatch(/"code":"rate_limited"/);
    expect(res.text).toMatch(/rate-limited/i);
  });

  it("emits an auth_failed frame on 401 from upstream", async () => {
    messagesStreamMock.mockImplementation(() => {
      const err = Object.assign(new Error("Unauthorized"), { status: 401 });
      return Promise.reject(err);
    });

    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "test" });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/"code":"auth_failed"/);
  });

  it("emits a model_error frame for unknown SDK errors", async () => {
    messagesStreamMock.mockImplementation(() =>
      Promise.reject(new Error("boom")),
    );
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ query: "test" });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/"code":"model_error"/);
  });
});

describe("POST /api/scenarios/:id/ai/query — read-only invariant", () => {
  it("does not mutate scenario data during a query (VAL-AI — read only)", async () => {
    messagesStreamMock.mockImplementation(() =>
      Promise.resolve(fakeStreamFromChunks(["ok"])),
    );

    const before = await Employee.find({ scenarioId: scenarioAId }).lean();

    await request(app)
      .post(`/api/scenarios/${scenarioAId}/ai/query`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        query:
          "Please delete Bob Report and promote everyone in Engineering.",
      });

    const after = await Employee.find({ scenarioId: scenarioAId }).lean();
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after.find((x) => String(x._id) === String(b._id));
      expect(a).toBeDefined();
      expect(a?.name).toBe(b.name);
      expect(a?.title).toBe(b.title);
      expect(a?.salary).toBe(b.salary);
    }
  });
});

describe("orgContext helpers (unit)", () => {
  it("buildEmployeeContext resolves manager names", () => {
    const mgr = { _id: "m1", name: "Alice", title: "EM", department: "Eng", level: "M3", location: "Remote", status: "Active", employmentType: "FTE", salary: 200000, equity: 0, managerId: null } as unknown as Parameters<typeof buildEmployeeContext>[0][number];
    const rep = { _id: "r1", name: "Bob", title: "Eng", department: "Eng", level: "IC3", location: "Remote", status: "Active", employmentType: "FTE", salary: 150000, equity: 0, managerId: "m1" } as unknown as Parameters<typeof buildEmployeeContext>[0][number];
    const ctx = buildEmployeeContext([mgr, rep]);
    expect(ctx).toHaveLength(2);
    const bob = ctx.find((e) => e.name === "Bob");
    expect(bob?.managerName).toBe("Alice");
    expect(bob?.managerId).toBe("m1");
  });

  it("summarizeDepartments aggregates headcount and salary", () => {
    const ctx = [
      {
        id: "1", name: "A", title: "T", department: "Eng",
        level: "IC3", location: "L", status: "Active",
        employmentType: "FTE", salary: 100, equity: null,
        managerId: null, managerName: null,
      },
      {
        id: "2", name: "B", title: "T", department: "Eng",
        level: "IC3", location: "L", status: "Active",
        employmentType: "FTE", salary: 200, equity: null,
        managerId: null, managerName: null,
      },
      {
        id: "3", name: "C", title: "T", department: "Sales",
        level: "IC3", location: "L", status: "Active",
        employmentType: "FTE", salary: 50, equity: null,
        managerId: null, managerName: null,
      },
    ];
    const summary = summarizeDepartments(ctx);
    expect(summary).toHaveLength(2);
    const eng = summary.find((d) => d.department === "Eng");
    expect(eng?.headcount).toBe(2);
    expect(eng?.totalSalary).toBe(300);
  });

  it("buildSystemPrompt contains read-only rule and dept summary", () => {
    const prompt = buildSystemPrompt(
      [
        {
          id: "1", name: "A", title: "T", department: "Eng",
          level: "IC3", location: "L", status: "Active",
          employmentType: "FTE", salary: 100, equity: null,
          managerId: null, managerName: null,
        },
      ],
      { orgName: "Acme", scenarioName: "Plan" },
    );
    expect(prompt).toMatch(/read[-\s]only/i);
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Plan");
    expect(prompt).toMatch(/Eng/);
  });
});


