import session, { SessionOptions } from "express-session";
import MongoStore from "connect-mongo";

/**
 * Build the shared express-session middleware used by both the long-running
 * server (src/index.ts → app.ts) and the Vercel serverless entry (api/index.ts).
 *
 * Sessions are stored in the same MongoDB cluster as application data via
 * connect-mongo (collection `sessions`). Cookies are HttpOnly + Lax and
 * marked Secure in production so they are not sent over plain HTTP.
 *
 * The session secret is read from `SESSION_SECRET`, falling back to the
 * legacy `JWT_SECRET` so existing deployments keep working during the
 * JWT → session cookie migration. If neither is configured we fail fast
 * at startup — a predictable/hardcoded signing secret would let attackers
 * forge session cookies, so we refuse to boot rather than silently using
 * an insecure default.
 */
export function buildSessionMiddleware() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET (or legacy JWT_SECRET) must be set. Refusing to start " +
        "with a predictable/default signing secret — set SESSION_SECRET in " +
        "the environment to a long random string.",
    );
  }
  const mongoUrl = process.env.MONGODB_URI;

  const options: SessionOptions = {
    name: "orgplanner.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // 7 days, in milliseconds.
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };

  if (mongoUrl) {
    options.store = MongoStore.create({
      mongoUrl,
      collectionName: "sessions",
      // Session documents are touched frequently; let Mongo TTL-expire them
      // using the cookie maxAge (in seconds).
      ttl: 7 * 24 * 60 * 60,
      // Avoid flooding the DB with updates on every request.
      touchAfter: 60 * 60,
    });
  }

  return session(options);
}
