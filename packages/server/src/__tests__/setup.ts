/**
 * Global Vitest setup for server integration tests.
 *
 * Runs once per worker before any test file is imported. Its job is to
 * guarantee that the environment variables required by
 * `buildSessionMiddleware` are set before any test transitively imports
 * `../app` (which constructs the session middleware at module load time).
 *
 * We intentionally do not overwrite values that are already present —
 * developers running tests locally may have a real `SESSION_SECRET` in
 * their `.env`, and we should respect it.
 */
import dotenv from "dotenv";
import path from "path";

// Load the server's .env so tests pick up MONGODB_URI / SESSION_SECRET /
// JWT_SECRET just like they do when dotenv is called at the top of each
// individual test file. Harmless if the file is absent.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// If neither secret is configured, inject a deterministic test value so
// session middleware can initialize. session.ts throws when nothing is
// set — we want the session cookie path to be exercised end-to-end in
// tests without forcing every contributor to configure a real secret.
if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET) {
  process.env.SESSION_SECRET = "test-secret";
}
