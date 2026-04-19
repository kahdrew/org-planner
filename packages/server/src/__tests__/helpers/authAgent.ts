/**
 * Session-based auth helper for server integration tests.
 *
 * Supertest's `request(app)` creates an isolated "stateless" client for each
 * call, so cookies set by one request are not sent by the next. Since we have
 * migrated from JWT Bearer tokens to session cookies, every test that acts as
 * an authenticated user must use `request.agent(app)` — an agent preserves
 * cookies across calls, just like a real browser.
 *
 * The helpers below create an agent and log it in (register or login) so that
 * subsequent `agent.get(...)`, `agent.post(...)` calls automatically carry
 * the `orgplanner.sid` session cookie.
 *
 * For tests that need the raw cookie string (e.g., SSE tests that open a
 * direct http.get socket and bypass supertest), `registerAndGetCookie` /
 * `loginAndGetCookie` return both the agent and the `Cookie` header value.
 */
import request from "supertest";
import type { Express } from "express";

/**
 * A supertest agent preserves cookies across calls, which is the mechanism
 * we rely on to simulate a browser that has been issued a session cookie.
 *
 * Inferring the type from `request.agent(...)` keeps us compatible with
 * both supertest v6 (Agent type) and v7 (TestAgent class) without needing
 * to import an internal path that may change between minor versions.
 */
export type TestAgent = ReturnType<typeof request.agent>;

export interface Credentials {
  email: string;
  password: string;
  name: string;
}

/**
 * Register a user and return an agent already carrying the session cookie.
 */
export async function registerAgent(
  app: Express,
  creds: Credentials,
): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(creds);
  if (res.status !== 201) {
    throw new Error(
      `registerAgent failed for ${creds.email}: ${res.status} ${JSON.stringify(
        res.body,
      )}`,
    );
  }
  return agent;
}

/**
 * Log an existing user in and return an agent already carrying the session
 * cookie. Useful for a second independent session of the same user.
 */
export async function loginAgent(
  app: Express,
  creds: Pick<Credentials, "email" | "password">,
): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send(creds);
  if (res.status !== 200) {
    throw new Error(
      `loginAgent failed for ${creds.email}: ${res.status} ${JSON.stringify(
        res.body,
      )}`,
    );
  }
  return agent;
}

/**
 * Register and return `{ agent, cookie }`. `cookie` is the raw `Cookie`
 * header value (e.g. `"orgplanner.sid=abc"`) suitable for passing to a raw
 * `http.get` or `fetch` client that does not share supertest's cookie jar.
 */
export async function registerAndGetCookie(
  app: Express,
  creds: Credentials,
): Promise<{ agent: TestAgent; cookie: string }> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(creds);
  if (res.status !== 201) {
    throw new Error(
      `registerAndGetCookie failed for ${creds.email}: ${res.status} ${JSON.stringify(
        res.body,
      )}`,
    );
  }
  const cookie = extractCookieHeader(res.headers["set-cookie"]);
  return { agent, cookie };
}

function extractCookieHeader(setCookie: unknown): string {
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  return arr.map((c: string) => c.split(";")[0]).join("; ");
}
